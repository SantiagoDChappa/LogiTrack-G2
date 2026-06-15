// LGT-182/184 — lógica de solicitud de devoluciones (elegibilidad, alta, consulta).
const { Op } = require('sequelize');
const sequelize = require('../database/connection');
const settingModel = require('../models/setting');
const { ShipmentReturn, ShipmentReturnHistory } = require('../models/shipmentReturn');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Status, ReturnStatus, ReturnReason, ReturnResult } = require('../constants/enums');

const DEFAULT_WINDOW_DAYS = 30;
const OPEN_STATUSES = [
    ReturnStatus.SOLICITADA, ReturnStatus.EN_REVISION,
    ReturnStatus.APROBADA, ReturnStatus.EN_PROCESO,
];
// Estados sobre los que el Supervisor todavía puede resolver (aprobar/rechazar).
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

const listByShipment = (shipmentId) =>
    ShipmentReturn.findAll({ where: { shipmentId }, order: [['createdAt', 'DESC']] });

// Elegibilidad: envío Entregado + dentro de la ventana + sin devolución abierta.
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
    const open = await findOpenByShipment(shipment.id);
    if (open) {
        return { ok: false, error: 'Ya hay una devolución en curso para este envío.', windowDays, deliveredAt, existing: open };
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
                    returnId: r.id, fromStatus: ReturnStatus.EN_PROCESO, toStatus: ReturnStatus.EN_PROCESO,
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
                    returnId: r.id, fromStatus: ReturnStatus.EN_PROCESO, toStatus: ReturnStatus.EN_PROCESO,
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

// Aprueba o rechaza una solicitud. No permite re-resolver (Esc.7).
// approve: define el resultado (reembolso/reemplazo), la devolución pasa a En proceso (Esc.3)
//          y se EJECUTA la resolución: reembolso → nota de crédito (LGT-214),
//          reemplazo → envío de reposición (LGT-215).
// reject:  requiere motivo y pasa a Rechazada (Esc.4).
const resolveReturn = async ({ returnId, userId, decision, result, rejectionReason }) => {
    const r = await ShipmentReturn.findByPk(returnId);
    if (!r) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (!PENDING_STATUSES.includes(r.status)) {
        return { ok: false, status: 400, message: 'Esta solicitud ya fue gestionada.' };
    }

    if (decision === 'approve') {
        const res = String(result || '').toUpperCase();
        if (![ReturnResult.REEMBOLSO, ReturnResult.REEMPLAZO].includes(res)) {
            return { ok: false, status: 400, message: 'Elegí un resultado: reembolso o reemplazo.' };
        }
        const from = r.status;
        await sequelize.transaction(async (t) => {
            await r.update({ status: ReturnStatus.EN_PROCESO, result: res, reviewedByUserId: userId, updatedAt: new Date() }, { transaction: t });
            await ShipmentReturnHistory.create({
                returnId: r.id, fromStatus: from, toStatus: ReturnStatus.EN_PROCESO,
                comment: `Aprobada — resultado ${res === ReturnResult.REEMBOLSO ? 'Reembolso' : 'Reemplazo'}. Pasa a En proceso.`,
                byUserId: userId, byClient: false, createdAt: new Date(),
            }, { transaction: t });
        });
        // LGT-214/215: ejecutar la resolución aprobada (idempotente, deja traza en el historial).
        const execution = await executeReturnResolution(r, userId);
        return { ok: true, status: ReturnStatus.EN_PROCESO, result: res, execution };
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
        return { ok: true, status: ReturnStatus.RECHAZADA };
    }

    return { ok: false, status: 400, message: 'Decisión inválida.' };
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
    getWindowDays, getDeliveredAt, findOpenByShipment, listByShipment,
    checkEligibility, validateModality, validateForm, createReturn,
    listPending, getByIdFull, resolveReturn,
    listForShipmentIds, findByIdWithHistory, updateModality,
};
