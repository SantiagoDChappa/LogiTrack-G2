// Devolución como un tipo de incidencia (incident_type code RETURN).
// Reemplaza al flujo basado en shipment_return: alta con elegibilidad
// (Entregado + ventana + única por envío), gestión vía incidencias y resolución
// PROCEDENTE → reembolso (nota de crédito al remitente) / NO_PROCEDENTE → rechazo.
const { Op } = require('sequelize');
const sequelize = require('../database/connection');
const settingModel = require('../models/setting');
const { Incident } = require('../models/incident');
const incidentTypeModel = require('../models/incidentType');
const incidentHistory = require('../models/incidentHistory');
const { ShipmentHistory } = require('../models/shipmentHistory');
const {
    Status, IncidentStatus, IncidentChannel, IncidentEventType,
    IncidentResolution, ReturnReason, ReturnReasonLabel,
} = require('../constants/enums');

const RETURN_CODE = 'RETURN';
const DEFAULT_WINDOW_DAYS = 30;
// Estados "abiertos" (no terminales) de una incidencia.
const OPEN_STATUSES = [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW];

// Ventana de devolución parametrizable por el Administrador (Ajustes). Default 30 días.
const getWindowDays = async () => {
    const raw = await settingModel.get('return_window_days');
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
};

const getReturnTypeId = async () => {
    const t = await incidentTypeModel.getByCode(RETURN_CODE);
    return t ? t.id : null;
};

const getDeliveredAt = async (shipmentId) => {
    const ev = await ShipmentHistory.findOne({
        where: { shipmentId, toStatusId: Status.DELIVERED.id },
        order: [['changedAt', 'DESC']],
    });
    return ev ? ev.changedAt : null;
};

// Cualquier devolución (incidencia RETURN) previa del envío, abierta o cerrada.
const findAnyByShipment = async (shipmentId) => {
    const typeId = await getReturnTypeId();
    if (!typeId) { return null; }
    return Incident.findOne({
        where: { shipmentId, incidentTypeId: typeId },
        order: [['createdAt', 'DESC']],
    });
};

const findOpenByShipment = async (shipmentId) => {
    const typeId = await getReturnTypeId();
    if (!typeId) { return null; }
    return Incident.findOne({
        where: { shipmentId, incidentTypeId: typeId, status: { [Op.in]: OPEN_STATUSES } },
    });
};

// Elegibilidad: envío Entregado + dentro de la ventana + sin devolución previa
// (abierta o cerrada) para ese envío.
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
        const open = OPEN_STATUSES.includes(existing.status);
        const msg = open
            ? 'Ya hay una devolución en curso para este envío.'
            : 'Este envío ya tiene una devolución registrada.';
        return { ok: false, error: msg, windowDays, deliveredAt, existing };
    }
    return { ok: true, windowDays, deliveredAt };
};

// Valida el motivo (+ texto libre si es OTRO).
const validateForm = (body) => {
    const reason = String(body.reason || '').toUpperCase();
    if (!Object.values(ReturnReason).includes(reason)) {
        return { error: 'Elegí un motivo de devolución.' };
    }
    if (reason === ReturnReason.OTRO && !String(body.reasonOther || '').trim()) {
        return { error: 'Detallá el motivo en el campo de texto.' };
    }
    return { reason };
};

// Descripción de la incidencia a partir del motivo + observaciones del cliente.
const buildDescription = (reason, body) => {
    const label = ReturnReasonLabel[reason] || 'Devolución';
    const parts = [`Devolución — Motivo: ${label}.`];
    if (reason === ReturnReason.OTRO && body.reasonOther) {
        parts.push(`Detalle: ${String(body.reasonOther).trim().slice(0, 1000)}`);
    }
    if (body.observations) {
        parts.push(`Observaciones: ${String(body.observations).trim().slice(0, 1000)}`);
    }
    return parts.join(' ').slice(0, 2000);
};

// ── Notificaciones ───────────────────────────────────────────────────────────

// Aviso in-app a supervisores de la sucursal del envío + administradores.
const notifyReturnCreatedInternal = async (shipment, incidentId) => {
    const inApp = require('./notification/inAppNotifier');
    const { User } = require('../models/user');
    const { RoleType } = require('../constants/enums');
    const branchId = shipment.currentBranchId || null;
    const where = branchId
        ? { active: true, [Op.or]: [{ roleId: RoleType.ADMIN.id }, { roleId: RoleType.SUPERVISOR.id, branchId }] }
        : { active: true, roleId: RoleType.ADMIN.id };
    const recipients = await User.findAll({ where, attributes: ['id'] });
    if (recipients.length === 0) { return; }
    const track = shipment.trackingId || shipment.id;
    await inApp.notifyMany(recipients.map(u => u.id), {
        event:        'RETURN_CREATED',
        title:        `Nueva devolución (incidencia #${incidentId}) · envío ${track}`,
        body:         `Pendiente de revisión · ${new Date().toLocaleString('es-AR')}`,
        resourceType: 'incident',
        resourceId:   incidentId,
        url:          `/incident/${incidentId}`,
    });
};

// Email de confirmación al REMITENTE cuando se crea la solicitud.
const notifyRemitenteReturnCreated = async (shipment, incidentId) => {
    const { sendEmail } = require('./notification/emailSender');
    let sender = shipment.sender;
    if (!sender) {
        const full = await require('../models/shipment').getById(shipment.id);
        sender = full?.sender;
    }
    const email = sender?.email;
    if (!email) { return; }
    const name  = sender?.fullName || 'cliente';
    const track = shipment.trackingId || `#${shipment.id}`;
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
        <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
        <p style="color:#64748b;margin-top:0">Sistema de gestión de envíos</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="font-size:15px;color:#1e293b">Hola <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#1e293b">Registramos una solicitud de devolución para el envío <strong>${track}</strong> (incidencia <strong>#${incidentId}</strong>). Nuestro equipo la revisará y te avisaremos cuando haya novedades.</p>
        <p style="font-size:13px;color:#64748b;margin-top:20px">Si tenés alguna consulta, contactá con tu sucursal de LogiTrack.</p>
    </div>`;
    await sendEmail(email, `Solicitud de devolución (incidencia #${incidentId}) recibida — LogiTrack`, html, 'html');
};

// Email al REMITENTE cuando la devolución es resuelta (procedente/no procedente).
const notifyRemitenteReturnResolved = async (shipment, incident, creditNote) => {
    const { sendEmail } = require('./notification/emailSender');
    const sender = shipment?.sender;
    const email = sender?.email;
    if (!email) { return; }
    const name  = sender?.fullName || 'cliente';
    const track = shipment.trackingId || `#${shipment.id}`;
    const procedente = incident.resolution === IncidentResolution.PROCEDENTE;
    const badgeColor = procedente ? '#16a34a' : '#dc2626';
    const badgeText  = procedente ? 'Aprobada (reembolso)' : 'Rechazada';
    const msg = procedente
        ? `Tu devolución fue <strong>aprobada</strong>. Se emitió la nota de crédito ${creditNote ? '<strong>' + creditNote.number + '</strong>' : ''} por el reembolso.`
        : 'Tu devolución fue <strong>rechazada</strong>. Podés comunicarte con tu sucursal de LogiTrack para más información.';
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
        <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
        <p style="color:#64748b;margin-top:0">Sistema de gestión de envíos</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="font-size:15px;color:#1e293b">Hola <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#1e293b">Novedades sobre tu devolución (incidencia <strong>#${incident.id}</strong>) · envío <strong>${track}</strong>:</p>
        <div style="background:${badgeColor};color:#fff;border-radius:6px;padding:12px 20px;display:inline-block;font-size:16px;font-weight:600;margin:8px 0">${badgeText}</div>
        <p style="font-size:15px;color:#1e293b">${msg}</p>
        <p style="font-size:13px;color:#64748b;margin-top:20px">Si tenés alguna consulta, contactá con tu sucursal de LogiTrack.</p>
    </div>`;
    await sendEmail(email, `Devolución (incidencia #${incident.id}) · envío ${track} — LogiTrack`, html, 'html');
};

// ── Alta ─────────────────────────────────────────────────────────────────────

// Crea la devolución como incidencia tipo RETURN. `client` (portal) u `userId` (staff).
const createReturn = async ({ shipment, client = null, userId = null, body }) => {
    const elig = await checkEligibility(shipment);
    if (!elig.ok) { return { ok: false, status: 400, message: elig.error }; }

    const v = validateForm(body);
    if (v.error) { return { ok: false, status: 400, message: v.error }; }

    const typeId = await getReturnTypeId();
    if (!typeId) { return { ok: false, status: 500, message: 'Falta el tipo de incidencia de devolución.' }; }

    const created = await sequelize.transaction(async (t) => {
        const inc = await Incident.create({
            shipmentId:       shipment.id,
            incidentTypeId:   typeId,
            status:           IncidentStatus.OPEN,
            priority:         2,
            escalated:        false,
            resolution:       null,
            description:      buildDescription(v.reason, body),
            returnReason:     v.reason,
            openedChannel:    client ? IncidentChannel.PORTAL : IncidentChannel.INTERNAL,
            openedByUserId:   userId || null,
            openedByPersonId: client?.personId || null,
            reporterName:     client?.fullName || null,
            reporterEmail:    client?.email || null,
        }, { transaction: t });

        await incidentHistory.create({
            incidentId: inc.id,
            eventType:  IncidentEventType.CREATED,
            toValue:    IncidentStatus.OPEN,
            comment:    client ? 'Devolución solicitada por el cliente.' : 'Devolución registrada por el staff.',
            userId:     userId || null,
            personId:   client?.personId || null,
            transaction: t,
        });
        return inc;
    });

    notifyRemitenteReturnCreated(shipment, created.id).catch(e => console.error('[returnIncident] email creación:', e.message));
    notifyReturnCreatedInternal(shipment, created.id).catch(e => console.error('[returnIncident] notif interna:', e.message));

    return { ok: true, incidentId: created.id };
};

// ── Gestión ──────────────────────────────────────────────────────────────────

// Toma la devolución para revisión: OPEN → IN_REVIEW (+ se asigna al usuario).
const takeReturn = async ({ incidentId, userId }) => {
    const typeId = await getReturnTypeId();
    const inc = await Incident.findOne({ where: { id: incidentId, incidentTypeId: typeId } });
    if (!inc) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (inc.status !== IncidentStatus.OPEN) {
        return { ok: false, status: 400, message: 'Solo se pueden tomar devoluciones abiertas.' };
    }
    await sequelize.transaction(async (t) => {
        await inc.update({ status: IncidentStatus.IN_REVIEW, assignedToUserId: userId }, { transaction: t });
        await incidentHistory.create({
            incidentId: inc.id, eventType: IncidentEventType.STATUS_CHANGE,
            fromValue: IncidentStatus.OPEN, toValue: IncidentStatus.IN_REVIEW,
            comment: 'Devolución tomada para revisión.', userId, transaction: t,
        });
    });
    return { ok: true };
};

// Resuelve una devolución abierta/en revisión.
//   approve → CLOSED + PROCEDENTE + nota de crédito al remitente.
//   reject  → CLOSED + NO_PROCEDENTE (motivo obligatorio).
const resolveReturn = async ({ incidentId, userId, decision, rejectionReason }) => {
    const typeId = await getReturnTypeId();
    const inc = await Incident.findOne({ where: { id: incidentId, incidentTypeId: typeId } });
    if (!inc) { return { ok: false, status: 404, message: 'Devolución no encontrada.' }; }
    if (!OPEN_STATUSES.includes(inc.status)) {
        return { ok: false, status: 400, message: 'Esta devolución ya fue gestionada.' };
    }

    const shipmentModel = require('../models/shipment');

    if (decision === 'approve') {
        await sequelize.transaction(async (t) => {
            await inc.update({
                status: IncidentStatus.CLOSED, resolution: IncidentResolution.PROCEDENTE,
                closedByUserId: userId, closedAt: new Date(),
            }, { transaction: t });
            await incidentHistory.create({
                incidentId: inc.id, eventType: IncidentEventType.CLOSED,
                fromValue: inc.status, toValue: IncidentStatus.CLOSED,
                comment: 'Devolución aprobada (procedente) — reembolso.', userId, transaction: t,
            });
        });

        // Reembolso: nota de crédito al remitente (idempotente).
        let creditNote = null;
        try {
            const cn = await require('./creditNoteService')
                .generate({ shipmentId: inc.shipmentId, incidentId: inc.id, userId });
            if (cn.ok && cn.creditNote) {
                creditNote = cn.creditNote;
                await incidentHistory.create({
                    incidentId: inc.id, eventType: IncidentEventType.COMMENT,
                    comment: `Nota de crédito ${cn.creditNote.number} generada por reembolso (/credit-note/${cn.creditNote.id}).`,
                    userId, internal: true,
                });
            }
        } catch (e) { console.error('[returnIncident] NC:', e.message); }

        const shipment = await shipmentModel.getById(inc.shipmentId);
        notifyRemitenteReturnResolved(shipment, inc, creditNote)
            .catch(e => console.error('[returnIncident] email resolución:', e.message));
        return { ok: true, status: IncidentStatus.CLOSED, resolution: IncidentResolution.PROCEDENTE, creditNote };
    }

    if (decision === 'reject') {
        const reason = String(rejectionReason || '').trim();
        if (!reason) { return { ok: false, status: 400, message: 'Ingresá un motivo de rechazo.' }; }
        await sequelize.transaction(async (t) => {
            await inc.update({
                status: IncidentStatus.CLOSED, resolution: IncidentResolution.NO_PROCEDENTE,
                closedByUserId: userId, closedAt: new Date(),
            }, { transaction: t });
            await incidentHistory.create({
                incidentId: inc.id, eventType: IncidentEventType.CLOSED,
                fromValue: inc.status, toValue: IncidentStatus.CLOSED,
                comment: `Devolución rechazada (no procedente): ${reason.slice(0, 500)}`, userId, transaction: t,
            });
        });
        const shipment = await shipmentModel.getById(inc.shipmentId);
        notifyRemitenteReturnResolved(shipment, inc, null)
            .catch(e => console.error('[returnIncident] email resolución:', e.message));
        return { ok: true, status: IncidentStatus.CLOSED, resolution: IncidentResolution.NO_PROCEDENTE };
    }

    return { ok: false, status: 400, message: 'Decisión inválida.' };
};

module.exports = {
    RETURN_CODE, OPEN_STATUSES, DEFAULT_WINDOW_DAYS,
    getWindowDays, getReturnTypeId, getDeliveredAt,
    findAnyByShipment, findOpenByShipment, checkEligibility, validateForm,
    createReturn, takeReturn, resolveReturn,
};
