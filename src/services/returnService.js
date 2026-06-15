// LGT-182/184 — lógica de solicitud de devoluciones (elegibilidad, alta, consulta).
const { Op } = require('sequelize');
const sequelize = require('../database/connection');
const settingModel = require('../models/setting');
const { ShipmentReturn, ShipmentReturnHistory } = require('../models/shipmentReturn');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Status, ReturnStatus, ReturnReason } = require('../constants/enums');

const DEFAULT_WINDOW_DAYS = 30;
const OPEN_STATUSES = [
    ReturnStatus.SOLICITADA, ReturnStatus.EN_REVISION,
    ReturnStatus.APROBADA, ReturnStatus.EN_PROCESO,
];
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

// Valida motivo (+ texto libre si es OTRO) y modalidad (LGT-184).
const validateForm = (body) => {
    const reason = String(body.reason || '').toUpperCase();
    if (!Object.values(ReturnReason).includes(reason)) {
        return { error: 'Elegí un motivo de devolución.' };
    }
    if (reason === ReturnReason.OTRO && !String(body.reasonOther || '').trim()) {
        return { error: 'Detallá el motivo en el campo de texto.' };
    }
    const deliveryMode = VALID_MODES.includes(body.deliveryMode) ? body.deliveryMode : 'home';
    let pickupBranchId = null;
    if (deliveryMode === 'branch') {
        pickupBranchId = body.pickupBranchId ? Number(body.pickupBranchId) : null;
        if (!pickupBranchId) {
            return { error: 'Elegí una sucursal para la entrega de la devolución.' };
        }
    }
    return { reason, deliveryMode, pickupBranchId };
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

module.exports = {
    DEFAULT_WINDOW_DAYS, OPEN_STATUSES, VALID_MODES,
    getWindowDays, getDeliveredAt, findOpenByShipment, listByShipment,
    checkEligibility, validateForm, createReturn,
    listForShipmentIds, findByIdWithHistory,
};
