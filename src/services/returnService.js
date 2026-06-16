// LGT-182/184 — lógica de solicitud de devoluciones (elegibilidad, alta, consulta).
const { Op } = require('sequelize');
const sequelize = require('../database/connection');
const settingModel = require('../models/setting');
const { ShipmentReturn, ShipmentReturnHistory } = require('../models/shipmentReturn');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Status, ReturnStatus, ReturnReason, ReturnResult } = require('../constants/enums');

const DEFAULT_WINDOW_DAYS = 30;
// Flujo: SOLICITADA → (tomar) EN_REVISION → (aprobar) FINALIZADA | (rechazar) RECHAZADA
const OPEN_STATUSES = [ReturnStatus.SOLICITADA, ReturnStatus.EN_REVISION];
// El cliente puede cambiar la modalidad mientras esté en estos estados.
const PENDING_STATUSES = [ReturnStatus.SOLICITADA, ReturnStatus.EN_REVISION];
const VALID_MODES = ['home', 'branch'];

// Ventana de devolución parametrizable por el Administrador (Ajustes). Default 30 días.
const getWindowDays = async () => {
    const raw = await settingModel.get('return_window_days');
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
};

const getDeliveredAt = async (shipmentId) => {
    const ev = await ShipmentHistory.findOne({
        where: { shipmentId, toStatusId: Status.DELIVERED.id },
        order: [['changedAt', 'DESC']],
    });
    return ev ? ev.changedAt : null;
};

const findOpenByShipment = (shipmentId) =>
    ShipmentReturn.findOne({ where: { shipmentId, status: { [Op.in]: OPEN_STATUSES } } });

const findAnyByShipment = (shipmentId) =>
    ShipmentReturn.findOne({ where: { shipmentId }, order: [['createdAt', 'DESC']] });

const listByShipment = (shipmentId) =>
    ShipmentReturn.findAll({ where: { shipmentId }, order: [['createdAt', 'DESC']] });

// Elegibilidad: envío Entregado + dentro de la ventana + sin devolución previa (abierta o terminal).
const checkEligibility = async (shipment) => {
    const windowDays = await getWindowDays();
    const windowMsg = `Solo podés devolver envíos entregados dentro de los ${windowDays} días.`;

    if (!shipment || shipment.statusId !== Status.DELIVERED.id) {
        return { ok: false, error: windowMsg, windowDays };
    }
    const deliveredAt = await getDeliveredAt(shipment.id);
    if (deliveredAt) {
        const limit = new Date(deliveredAt);
        limit.setDate(limit.getDate() + windowDays);
        if (new Date() > limit) {
            return { ok: false, error: windowMsg, windowDays, deliveredAt };
        }
    }
    const existing = await findAnyByShipment(shipment.id);
    if (existing) {
        const msg = existing.status === ReturnStatus.RECHAZADA
            ? 'La devolución de este envío fue rechazada. Contactá a soporte si querés apelar.'
            : existing.status === ReturnStatus.FINALIZADA
                ? 'La devolución de este envío ya fue finalizada.'
                : 'Ya hay una devolución en curso para este envío.';
        return { ok: false, error: msg, windowDays, deliveredAt, existing };
    }
    return { ok: true, windowDays, deliveredAt };
};

// Valida la modalidad (LGT-184): retiro a domicilio o entrega en sucursal (sucursal obligatoria).
const validateModality = (body) => {
    const deliveryMode = VALID_MODES.includes(body.deliveryMode) ? body.deliveryMode : 'home';
    let pickupBranchId = null;
    if (deliveryMode === 'branch') {
        pickupBranchId = body.pickupBranchId ? Number(body.pickupBranchId) : null;
        if (!pickupBranchId) {
            return { error: 'Elegí una sucursal para la entrega de la devolución.' };
        }
    }
    return { deliveryMode, pickupBranchId };
};

// Valida motivo (+ texto libre si es OTRO) y modalidad (LGT-184).
const validateForm = (body) => {
    const reason = String(body.reason || '').toUpperCase();
    if (!Object.values(ReturnReason).includes(reason)) {
        return { error: 'Elegí un motivo de devolución.' };
    }
    if (reason === ReturnReason.OTRO && !String(body.reasonOther || '').trim()) {
        return { error: 'Detallá el motivo en el campo de texto.' };
    }
    const m = validateModality(body);
    if (m.error) { return { error: m.error }; }
    return { reason, deliveryMode: m.deliveryMode, pickupBranchId: m.pickupBranchId };
};

// LGT-218/219 — al registrarse una devolución, avisa por el centro in-app a los
// supervisores de la sucursal del envío Y a todos los administradores.
// Best-effort: no rompe el alta si la notificación falla.
const notifyReturnCreated = async (shipment, returnId) => {
    const inApp = require('./notification/inAppNotifier');
    const { User } = require('../models/user');
    const { RoleType } = require('../constants/enums');
    const branchId = shipment.currentBranchId || null;

    // Siempre avisa a todos los admins + supervisores de la sucursal del envío.
    const where = branchId
        ? { active: true, [Op.or]: [{ roleId: RoleType.ADMIN.id }, { roleId: RoleType.SUPERVISOR.id, branchId }] }
        : { active: true, roleId: RoleType.ADMIN.id };

    const recipients = await User.findAll({ where, attributes: ['id'] });
    if (recipients.length === 0) { return; }

    const track = shipment.trackingId || shipment.id;
    await inApp.notifyMany(recipients.map(u => u.id), {
        event:        'RETURN_CREATED',
        title:        `Nueva devolución #${returnId} · envío ${track}`,
        body:         `Pendiente de revisión · ${new Date().toLocaleString('es-AR')}`,
        resourceType: 'return',
        resourceId:   returnId,
        url:          `/returns/${returnId}`,
    });
};

// Email de confirmación al cliente del portal cuando crea la solicitud.
const notifyClientReturnCreated = async (shipment, returnId) => {
    const { sendEmail } = require('./notification/emailSender');
    const email = shipment.recipient?.email;
    if (!email) { return; }
    const name  = shipment.recipient?.fullName || 'cliente';
    const track = shipment.trackingId || `#${shipment.id}`;
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
        <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
        <p style="color:#64748b;margin-top:0">Sistema de gestión de envíos</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="font-size:15px;color:#1e293b">Hola <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#1e293b">Recibimos tu solicitud de devolución <strong>#${returnId}</strong> para el envío <strong>${track}</strong>. Nuestro equipo la revisará a la brevedad y te avisaremos cuando haya novedades.</p>
        <p style="font-size:13px;color:#64748b;margin-top:20px">Si tenés alguna consulta, contactá con tu sucursal de LogiTrack.</p>
    </div>`;
    await sendEmail(email, `Solicitud de devolución #${returnId} recibida — LogiTrack`, html, 'html');
};

// Email al cliente cuando su devolución es aprobada o rechazada.
const notifyClientReturnResolved = async (r) => {
    const { sendEmail } = require('./notification/emailSender');
    const shipmentModel = require('../models/shipment');
    const shipment = await shipmentModel.getById(r.shipmentId);
    const email = shipment?.recipient?.email;
    if (!email) { return; }
    const name  = shipment.recipient?.fullName || 'cliente';
    const track = shipment.trackingId || `#${r.shipmentId}`;
    const approved = r.status === ReturnStatus.APROBADA;
    const badgeColor = approved ? '#16a34a' : '#dc2626';
    const badgeText  = approved ? 'Aprobada' : 'Rechazada';
    const msg = approved
        ? 'Tu solicitud fue <strong>aprobada</strong>. Nos contactaremos para coordinar los próximos pasos.'
        : 'Tu solicitud fue <strong>rechazada</strong>. Podés comunicarte con tu sucursal de LogiTrack para más información.';
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
        <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
        <p style="color:#64748b;margin-top:0">Sistema de gestión de envíos</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="font-size:15px;color:#1e293b">Hola <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#1e293b">Novedades sobre tu devolución <strong>#${r.id}</strong> · envío <strong>${track}</strong>:</p>
        <div style="background:${badgeColor};color:#fff;border-radius:6px;padding:12px 20px;display:inline-block;font-size:16px;font-weight:600;margin:8px 0">${badgeText}</div>
        <p style="font-size:15px;color:#1e293b">${msg}</p>
        <p style="font-size:13px;color:#64748b;margin-top:20px">Si tenés alguna consulta, contactá con tu sucursal de LogiTrack.</p>
    </div>`;
    await sendEmail(email, `Devolución #${r.id} ${badgeText.toLowerCase()} · envío ${track} — LogiTrack`, html, 'html');
};

const createReturn = async ({ shipment, client, body }) => {
    const elig = await checkEligibility(shipment);
    if (!elig.ok) { return { ok: false, status: 400, message: elig.error }; }

    const v = validateForm(body);
    if (v.error) { return { ok: false, status: 400, message: v.error }; }

    const created = await sequelize.transaction(async (t) => {
        const r = await ShipmentReturn.create({
            shipmentId:   shipment.id,
            status:       ReturnStatus.SOLICITADA,
            reason:       v.reason,
            reasonOther:  v.reason === ReturnReason.OTRO ? String(body.reasonOther).trim().slice(0, 2000) : null,
            observations: body.observations ? String(body.observations).trim().slice(0, 2000) : null,
            deliveryMode: v.deliveryMode,
            pickupBranchId: v.pickupBranchId,
            createdByDocument: client?.document || null,
            createdAt:    new Date(),
            updatedAt:    new Date(),
        }, { transaction: t });

        await ShipmentReturnHistory.create({
            returnId:  r.id,
            fromStatus: null,
            toStatus:  ReturnStatus.SOLICITADA,
            comment:   'Solicitud de devolución registrada por el cliente.',
            byClient:  true,
            createdAt: new Date(),
        }, { transaction: t });

        return r;
    });

    // Email al cliente del portal + aviso in-app interno (best-effort, fire-and-forget).
    notifyClientReturnCreated(shipment, created.id).catch(e => console.error('[returnService] email creación:', e.message));
    notifyReturnCreated(shipment, created.id).catch((e) => console.error('[returnService] notif devolución:', e.message));

    return { ok: true, returnId: created.id };
};

// ── Gestión interna (LGT-183) ────────────────────────────────────────────────

// Bandeja: devoluciones pendientes de evaluación (Solicitada / En revisión).
const listPending = () => {
    const { Shipment } = require('../models/shipment');
    return ShipmentReturn.findAll({
        where: { status: { [Op.in]: PENDING_STATUSES } },
        include: [{ model: Shipment, as: 'shipment', attributes: ['id', 'trackingId'] }],
        order: [['createdAt', 'ASC']],
    });
};

// Bandeja filtrable: admite status, reason, trackingId y id numérico.
const listFiltered = (filters = {}) => {
    const { Shipment } = require('../models/shipment');
    const where = {};

    if (filters.status)                              { where.status = filters.status; }
    if (filters.reason)                              { where.reason = filters.reason; }
    if (filters.id && !isNaN(Number(filters.id)))   { where.id     = Number(filters.id); }

    const byTracking  = filters.trackingId ? filters.trackingId.trim() : '';
    const shipmentWhere = byTracking ? { trackingId: { [Op.iLike]: `%${byTracking}%` } } : {};

    return ShipmentReturn.findAll({
        where,
        include: [{
            model: Shipment,
            as: 'shipment',
            attributes: ['id', 'trackingId'],
            ...(byTracking ? { where: shipmentWhere } : {}),
            required: !!byTracking,
        }],
        order: [['createdAt', 'DESC']],
    });
};

const getByIdFull = (id) => {
    const { Shipment } = require('../models/shipment');
    const { User } = require('../models/user');
    const { Branch } = require('../models/branch');
    return ShipmentReturn.findByPk(id, {
        include: [
            { model: Shipment, as: 'shipment', attributes: ['id', 'trackingId', 'recipientId'] },
            { model: Branch, as: 'pickupBranch', attributes: ['id', 'name'], required: false },
            { model: User, as: 'reviewedBy', attributes: ['id', 'fullName'], required: false },
            { model: ShipmentReturnHistory, as: 'history', required: false },
        ],
        order: [[{ model: ShipmentReturnHistory, as: 'history' }, 'createdAt', 'ASC']],
    });
};

// ── Seguimiento del cliente (LGT-186) ────────────────────────────────────────

// Todas las devoluciones de un conjunto de envíos (los del cliente con identidad validada).
const listForShipmentIds = (shipmentIds) => {
    const { Shipment } = require('../models/shipment');
    const ids = (shipmentIds || []).filter(Boolean);
    return ShipmentReturn.findAll({
        where: { shipmentId: { [Op.in]: ids.length ? ids : [-1] } },
        include: [{ model: Shipment, as: 'shipment', attributes: ['id', 'trackingId'] }],
        order: [['createdAt', 'DESC']],
    });
};

// Detalle con historial cronológico (para el seguimiento del cliente).
const findByIdWithHistory = (id) => {
    const { Shipment } = require('../models/shipment');
    return ShipmentReturn.findByPk(id, {
        include: [
            { model: Shipment, as: 'shipment', attributes: ['id', 'trackingId'] },
            { model: ShipmentReturnHistory, as: 'history', required: false },
        ],
        order: [[{ model: ShipmentReturnHistory, as: 'history' }, 'createdAt', 'ASC']],
    });
};

// Ejecuta la resolución aprobada con los mecanismos compartidos (idempotentes):
// reembolso → nota de crédito (LGT-214), reemplazo → envío de reposición (LGT-215).
// Best-effort fuera de la transacción de estado; deja traza en el historial de la devolución.
const executeReturnResolution = async (r, userId) => {
    try {
        if (r.result === ReturnResult.REEMBOLSO) {
            const cn = await require('./creditNoteService')
                .generate({ shipmentId: r.shipmentId, returnId: r.id, userId });
            if (cn.ok && cn.creditNote) {
                await ShipmentReturnHistory.create({
                    returnId: r.id, fromStatus: ReturnStatus.APROBADA, toStatus: ReturnStatus.APROBADA,
                    comment: `Nota de crédito ${cn.creditNote.number} generada por reembolso (/credit-note/${cn.creditNote.id}).`,
                    byUserId: userId, byClient: false, createdAt: new Date(),
                });
                return { kind: 'creditNote', creditNote: cn.creditNote };
            }
        } else if (r.result === ReturnResult.REEMPLAZO) {
            const rep = await require('./replacementService')
                .generate({ originalShipmentId: r.shipmentId });
            if (rep.ok && rep.shipment) {
                await ShipmentReturnHistory.create({
                    returnId: r.id, fromStatus: ReturnStatus.APROBADA, toStatus: ReturnStatus.APROBADA,
                    comment: `Envío de reposición ${rep.shipment.trackingId} generado por reemplazo (#${rep.shipment.id}).`,
                    byUserId: userId, byClient: false, createdAt: new Date(),
                });
                return { kind: 'replacement', shipment: rep.shipment };
            }
        }
    } catch (e) {
        console.error('[returnService] ejecución de resolución:', e.message);
    }
    return null;
};

// Aprueba o rechaza una solicitud tomada (EN_REVISION). No permite re-resolver.
// approve: define resultado (reembolso/reemplazo) → FINALIZADA + NC o reposición auto-generados.
// reject:  requiere motivo → RECHAZADA.
const resolveReturn = async ({ returnId, userId, decision, result, rejectionReason }) => {
    const r = await ShipmentReturn.findByPk(returnId);
    if (!r) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (r.status !== ReturnStatus.EN_REVISION) {
        return { ok: false, status: 400, message: r.status === ReturnStatus.SOLICITADA ? 'Primero tomá la devolución para revisión.' : 'Esta solicitud ya fue gestionada.' };
    }

    if (decision === 'approve') {
        const res = String(result || '').toUpperCase();
        if (![ReturnResult.REEMBOLSO, ReturnResult.REEMPLAZO].includes(res)) {
            return { ok: false, status: 400, message: 'Elegí un resultado: reembolso o reemplazo.' };
        }
        await sequelize.transaction(async (t) => {
            await r.update({ status: ReturnStatus.APROBADA, result: res, reviewedByUserId: userId, updatedAt: new Date() }, { transaction: t });
            await ShipmentReturnHistory.create({
                returnId: r.id, fromStatus: ReturnStatus.EN_REVISION, toStatus: ReturnStatus.APROBADA,
                comment: `Aprobada — resultado ${res === ReturnResult.REEMBOLSO ? 'Reembolso' : 'Reemplazo'}.`,
                byUserId: userId, byClient: false, createdAt: new Date(),
            }, { transaction: t });
        });
        // LGT-214/215: ejecutar la resolución aprobada (idempotente, deja traza en el historial).
        const execution = await executeReturnResolution(r, userId);
        notifyClientReturnResolved(r).catch(e => console.error('[returnService] email resolución:', e.message));
        return { ok: true, status: ReturnStatus.APROBADA, result: res, execution };
    }

    if (decision === 'reject') {
        const reason = String(rejectionReason || '').trim();
        if (!reason) { return { ok: false, status: 400, message: 'Ingresá un motivo de rechazo.' }; }
        const from = r.status;
        await sequelize.transaction(async (t) => {
            await r.update({ status: ReturnStatus.RECHAZADA, rejectionReason: reason.slice(0, 2000), reviewedByUserId: userId, updatedAt: new Date() }, { transaction: t });
            await ShipmentReturnHistory.create({
                returnId: r.id, fromStatus: from, toStatus: ReturnStatus.RECHAZADA,
                comment: `Rechazada: ${reason.slice(0, 500)}`,
                byUserId: userId, byClient: false, createdAt: new Date(),
            }, { transaction: t });
        });
        notifyClientReturnResolved(r).catch(e => console.error('[returnService] email resolución:', e.message));
        return { ok: true, status: ReturnStatus.RECHAZADA };
    }

    return { ok: false, status: 400, message: 'Decisión inválida.' };
};

// Supervisor toma la devolución para revisión: SOLICITADA → EN_REVISION.
const takeReturn = async ({ returnId, userId }) => {
    const r = await ShipmentReturn.findByPk(returnId);
    if (!r) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (r.status !== ReturnStatus.SOLICITADA) {
        return { ok: false, status: 400, message: 'Solo se pueden tomar devoluciones en estado Solicitada.' };
    }
    await sequelize.transaction(async (t) => {
        await r.update({ status: ReturnStatus.EN_REVISION, reviewedByUserId: userId, updatedAt: new Date() }, { transaction: t });
        await ShipmentReturnHistory.create({
            returnId: r.id, fromStatus: ReturnStatus.SOLICITADA, toStatus: ReturnStatus.EN_REVISION,
            comment: 'Devolución tomada para revisión.',
            byUserId: userId, byClient: false, createdAt: new Date(),
        }, { transaction: t });
    });
    return { ok: true };
};

// LGT-184 Esc.7/8 — el cliente cambia la modalidad mientras la devolución no fue tomada
// operativamente (Solicitada / En revisión); una vez En proceso, no se permite.
const updateModality = async ({ returnId, body }) => {
    const r = await ShipmentReturn.findByPk(returnId);
    if (!r) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (!PENDING_STATUSES.includes(r.status)) {
        return { ok: false, status: 400, message: 'La devolución ya está en proceso.' };
    }
    const v = validateModality(body);
    if (v.error) { return { ok: false, status: 400, message: v.error }; }

    const sameBranch = (r.pickupBranchId || null) === (v.pickupBranchId || null);
    if (r.deliveryMode === v.deliveryMode && sameBranch) {
        return { ok: true, unchanged: true, deliveryMode: v.deliveryMode };
    }

    await sequelize.transaction(async (t) => {
        await r.update({ deliveryMode: v.deliveryMode, pickupBranchId: v.pickupBranchId, updatedAt: new Date() }, { transaction: t });
        await ShipmentReturnHistory.create({
            returnId: r.id, fromStatus: r.status, toStatus: r.status,
            comment: `Modalidad actualizada a ${v.deliveryMode === 'branch' ? 'Entrega en sucursal' : 'Retiro a domicilio'} por el cliente.`,
            byClient: true, createdAt: new Date(),
        }, { transaction: t });
    });
    return { ok: true, deliveryMode: v.deliveryMode };
};

module.exports = {
    DEFAULT_WINDOW_DAYS, OPEN_STATUSES, PENDING_STATUSES, VALID_MODES,
    getWindowDays, getDeliveredAt, findOpenByShipment, findAnyByShipment, listByShipment,
    checkEligibility, validateModality, validateForm, createReturn,
    listPending, listFiltered, getByIdFull, takeReturn, resolveReturn,
    listForShipmentIds, findByIdWithHistory, updateModality,
};
