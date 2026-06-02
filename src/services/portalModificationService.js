const sequelize = require('../database/connection');
const { Shipment } = require('../models/shipment');
const { Address } = require('../models/address');
const modificationRequestModel = require('../models/shipmentModificationRequest');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { SELF_SERVICE_STATUS_IDS } = require('./portalShipmentView');
const {
    ModificationRequestStatus,
    ModificationChangeType,
    ModificationChannel,
    ShipmentHistoryEvent,
    NotificationEvent,
} = require('../constants/enums');

const trimOrNull = (v) => {
    const s = String(v || '').trim();
    return s || null;
};

const normTime = (v) => (v ? String(v).slice(0, 8) : null);

const shipmentJson = (shipment) => (typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment);

const canModifyShipment = (shipment) => {
    const json = shipmentJson(shipment);
    return SELF_SERVICE_STATUS_IDS.includes(Number(json.statusId ?? json.status?.id));
};

const buildSnapshot = (shipment) => {
    const json = shipmentJson(shipment);
    const addr = json.address || {};
    return {
        expectedDeliveryFrom: normTime(json.expectedDeliveryFrom),
        expectedDeliveryTo:   normTime(json.expectedDeliveryTo),
        deliveryMode:         json.deliveryMode,
        pickupBranchId:       json.pickupBranchId,
        address: {
            street:        addr.street || null,
            number:        addr.number || null,
            postalCode:    addr.postalCode || null,
            provinceId:    addr.provinceId || null,
            ringLabel:     addr.ringLabel || null,
            floorApt:      addr.floorApt || null,
            referencesTxt: addr.referencesTxt || null,
            porterNote:    addr.porterNote || null,
            restrictions:  addr.restrictions || null,
        },
    };
};

const parseModificationPayload = (body, shipment) => {
    const snapshot = buildSnapshot(shipment);
    const addr = snapshot.address;

    const direct = {};
    const sensitive = {};

    const from = body.windowFrom ? normTime(body.windowFrom) : null;
    const to = body.windowTo ? normTime(body.windowTo) : null;
    if (from !== snapshot.expectedDeliveryFrom || to !== snapshot.expectedDeliveryTo) {
        direct.expectedDeliveryFrom = from;
        direct.expectedDeliveryTo = to;
    }

    const deliveryMode = body.deliveryMode || snapshot.deliveryMode;
    const pickupBranchId = body.pickupBranchId ? Number(body.pickupBranchId) : null;
    if (deliveryMode !== snapshot.deliveryMode) {
        direct.deliveryMode = deliveryMode;
    }
    const effectiveMode = direct.deliveryMode || snapshot.deliveryMode;
    const effectiveBranch = direct.deliveryMode === 'branch_pickup'
        ? pickupBranchId
        : (direct.deliveryMode === 'home' ? null : (pickupBranchId || snapshot.pickupBranchId));
    if (effectiveMode === 'branch_pickup' && effectiveBranch !== snapshot.pickupBranchId) {
        direct.pickupBranchId = effectiveBranch;
    } else if (effectiveMode === 'home' && snapshot.pickupBranchId) {
        direct.pickupBranchId = null;
    }

    const refFields = ['ringLabel', 'floorApt', 'referencesTxt', 'porterNote', 'restrictions'];
    const addressRefs = {};
    refFields.forEach((field) => {
        const val = trimOrNull(body[field]);
        if (val !== (addr[field] || null)) {
            addressRefs[field] = val;
        }
    });
    if (Object.keys(addressRefs).length) {
        direct.address = addressRefs;
    }

    const street = trimOrNull(body.street);
    const number = trimOrNull(body.number);
    const postalCode = trimOrNull(body.postalCode);
    const provinceId = body.provinceId ? Number(body.provinceId) : null;

    if (street && street !== (addr.street || null)) { sensitive.street = street; }
    if (number && number !== (addr.number || null)) { sensitive.number = number; }
    if (postalCode && postalCode !== (addr.postalCode || null)) { sensitive.postalCode = postalCode; }
    if (provinceId && provinceId !== (addr.provinceId || null)) { sensitive.provinceId = provinceId; }

    return {
        direct,
        sensitive,
        snapshot,
        hasDirect: Object.keys(direct).length > 0,
        hasSensitive: Object.keys(sensitive).length > 0,
    };
};

const inferChangeType = (direct, sensitive) => {
    const dKeys = Object.keys(direct);
    const sKeys = Object.keys(sensitive);
    if (dKeys.length && sKeys.length) { return ModificationChangeType.MIXED; }
    if (sKeys.length) { return ModificationChangeType.ADDRESS_CHANGE; }
    if (direct.expectedDeliveryFrom !== undefined || direct.expectedDeliveryTo !== undefined) {
        return ModificationChangeType.DELIVERY_WINDOW;
    }
    if (direct.deliveryMode !== undefined) { return ModificationChangeType.DELIVERY_MODE; }
    if (direct.pickupBranchId !== undefined) { return ModificationChangeType.PICKUP_BRANCH; }
    if (direct.address) { return ModificationChangeType.DELIVERY_REFERENCES; }
    return ModificationChangeType.MIXED;
};

const describeChanges = (requested) => {
    const parts = [];
    if (requested.expectedDeliveryFrom !== undefined || requested.expectedDeliveryTo !== undefined) {
        parts.push('franja horaria');
    }
    if (requested.deliveryMode !== undefined) { parts.push('modalidad de entrega'); }
    if (requested.pickupBranchId !== undefined) { parts.push('sucursal de retiro'); }
    if (requested.address) { parts.push('referencias de domicilio'); }
    if (requested.street || requested.number || requested.postalCode || requested.provinceId) {
        parts.push('dirección de entrega');
    }
    return parts.join(', ') || 'modificación';
};

const recordHistory = async (shipment, eventType, comment, transaction) => {
    const json = shipmentJson(shipment);
    await shipmentHistoryModel.create({
        shipmentId:   json.id,
        fromStatusId: json.statusId,
        toStatusId:   json.statusId,
        comment,
        userId:       null,
        eventType,
    }, { transaction });
};

const applyDirectChanges = async (shipment, directPayload, transaction) => {
    const json = shipmentJson(shipment);
    const shipmentUpdate = {};
    if (directPayload.expectedDeliveryFrom !== undefined) {
        shipmentUpdate.expectedDeliveryFrom = directPayload.expectedDeliveryFrom;
    }
    if (directPayload.expectedDeliveryTo !== undefined) {
        shipmentUpdate.expectedDeliveryTo = directPayload.expectedDeliveryTo;
    }
    if (directPayload.deliveryMode !== undefined) {
        shipmentUpdate.deliveryMode = directPayload.deliveryMode;
    }
    if (directPayload.pickupBranchId !== undefined) {
        shipmentUpdate.pickupBranchId = directPayload.pickupBranchId;
    }

    if (Object.keys(shipmentUpdate).length) {
        await Shipment.update(shipmentUpdate, { where: { id: json.id }, transaction });
    }

    if (directPayload.address && json.addressId) {
        await Address.update(directPayload.address, { where: { id: json.addressId }, transaction });
    }

    const windowChanged = directPayload.expectedDeliveryFrom !== undefined
        || directPayload.expectedDeliveryTo !== undefined
        || directPayload.deliveryMode !== undefined;
    if (windowChanged) {
        try {
            require('../controllers/shipment').notifyShipmentEvent(
                NotificationEvent.SHIPMENT_RESCHEDULED,
                json.id
            ).catch(() => {});
        } catch { /* ignore */ }
    }
};

const createRequestRecord = async ({
    shipmentId, changeType, payload, status, client, transaction,
}) => {
    return modificationRequestModel.create({
        shipmentId,
        changeType,
        payload,
        status,
        channel: ModificationChannel.PORTAL,
        requestedByDocument: client?.document ?? null,
        requestedByEmail:    client?.email ?? null,
        createdAt:           new Date(),
    }, { transaction });
};

const submitPortalModification = async ({ shipment, client, body }) => {
    if (!canModifyShipment(shipment)) {
        return {
            ok: false,
            status: 409,
            message: 'Este envío ya no admite modificaciones desde el portal.',
        };
    }

    const parsed = parseModificationPayload(body, shipment);
    if (!parsed.hasDirect && !parsed.hasSensitive) {
        return { ok: false, status: 400, message: 'No se detectaron cambios para registrar.' };
    }

    const mode = parsed.direct.deliveryMode
        || (parsed.direct.pickupBranchId !== undefined ? 'branch_pickup' : null)
        || shipmentJson(shipment).deliveryMode;
    const branchId = parsed.direct.pickupBranchId !== undefined
        ? parsed.direct.pickupBranchId
        : (body.pickupBranchId ? Number(body.pickupBranchId) : shipmentJson(shipment).pickupBranchId);

    if (mode === 'branch_pickup' && !branchId) {
        return { ok: false, status: 400, message: 'Seleccioná una sucursal de retiro válida.' };
    }

    const applied = [];
    const pending = [];
    const json = shipmentJson(shipment);

    await sequelize.transaction(async (transaction) => {
        if (parsed.hasDirect) {
            const changeType = inferChangeType(parsed.direct, {});
            const payload = { before: parsed.snapshot, requested: parsed.direct };
            await applyDirectChanges(shipment, parsed.direct, transaction);
            const record = await createRequestRecord({
                shipmentId: json.id,
                changeType,
                payload,
                status: ModificationRequestStatus.APPLIED,
                client,
                transaction,
            });
            await recordHistory(
                shipment,
                ShipmentHistoryEvent.MODIFICATION_APPLIED,
                `Modificación portal aplicada: ${describeChanges(parsed.direct)} (solicitud #${record.id})`,
                transaction
            );
            applied.push({ id: record.id, changeType, summary: describeChanges(parsed.direct) });
        }

        if (parsed.hasSensitive) {
            const changeType = ModificationChangeType.ADDRESS_CHANGE;
            const payload = { before: parsed.snapshot, requested: parsed.sensitive };
            const record = await createRequestRecord({
                shipmentId: json.id,
                changeType,
                payload,
                status: ModificationRequestStatus.PENDING_REVIEW,
                client,
                transaction,
            });
            await recordHistory(
                shipment,
                ShipmentHistoryEvent.MODIFICATION_REQUESTED,
                `Solicitud de modificación portal pendiente de revisión: ${describeChanges(parsed.sensitive)} (solicitud #${record.id})`,
                transaction
            );
            pending.push({ id: record.id, changeType, summary: describeChanges(parsed.sensitive) });
        }
    });

    return { ok: true, applied, pending, shipmentId: json.id, trackingId: json.trackingId };
};

const applySensitivePayload = async (shipment, sensitivePayload, transaction) => {
    const json = shipmentJson(shipment);
    if (!json.addressId) { throw new Error('El envío no tiene dirección asociada.'); }
    await Address.update({
        street:     sensitivePayload.street ?? undefined,
        number:     sensitivePayload.number ?? undefined,
        postalCode: sensitivePayload.postalCode ?? undefined,
        provinceId: sensitivePayload.provinceId ?? undefined,
    }, { where: { id: json.addressId }, transaction });
};

const approveRequest = async (requestId, user) => {
    const request = await modificationRequestModel.findById(requestId);
    if (!request) { return { ok: false, status: 404, message: 'Solicitud no encontrada.' }; }
    if (request.status !== ModificationRequestStatus.PENDING_REVIEW) {
        return { ok: false, status: 409, message: 'La solicitud ya fue procesada.' };
    }

    const shipment = await Shipment.findByPk(request.shipmentId, {
        include: [{ model: Address, as: 'address', required: false }],
    });
    if (!shipment) { return { ok: false, status: 404, message: 'Envío no encontrado.' }; }

    const requested = request.payload?.requested || {};

    await sequelize.transaction(async (transaction) => {
        await applySensitivePayload(shipment, requested, transaction);
        await modificationRequestModel.updateById(requestId, {
            status: ModificationRequestStatus.APPLIED,
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
        }, { transaction });
        await recordHistory(
            shipment,
            ShipmentHistoryEvent.MODIFICATION_APPLIED,
            `Modificación aprobada por operador: ${describeChanges(requested)} (solicitud #${requestId})`,
            transaction
        );
    });

    return { ok: true, requestId, shipmentId: request.shipmentId };
};

const rejectRequest = async (requestId, user, comment) => {
    const request = await modificationRequestModel.findById(requestId);
    if (!request) { return { ok: false, status: 404, message: 'Solicitud no encontrada.' }; }
    if (request.status !== ModificationRequestStatus.PENDING_REVIEW) {
        return { ok: false, status: 409, message: 'La solicitud ya fue procesada.' }; }

    const shipment = await Shipment.findByPk(request.shipmentId);
    if (!shipment) { return { ok: false, status: 404, message: 'Envío no encontrado.' }; }

    const reviewComment = trimOrNull(comment) || 'Rechazada por operador.';

    await sequelize.transaction(async (transaction) => {
        await modificationRequestModel.updateById(requestId, {
            status: ModificationRequestStatus.REJECTED,
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            reviewComment,
        }, { transaction });
        await recordHistory(
            shipment,
            ShipmentHistoryEvent.MODIFICATION_REJECTED,
            `Modificación rechazada: ${reviewComment} (solicitud #${requestId})`,
            transaction
        );
    });

    return { ok: true, requestId };
};

const listByShipment = (shipmentId) => modificationRequestModel.listByShipmentId(shipmentId);

const listPending = (filters = {}) => modificationRequestModel.listPending(filters);

const changeTypeLabel = (type) => ({
    [ModificationChangeType.DELIVERY_WINDOW]:     'Franja horaria',
    [ModificationChangeType.DELIVERY_MODE]:       'Modalidad de entrega',
    [ModificationChangeType.PICKUP_BRANCH]:       'Sucursal de retiro',
    [ModificationChangeType.DELIVERY_REFERENCES]:   'Referencias de domicilio',
    [ModificationChangeType.ADDRESS_CHANGE]:      'Cambio de dirección',
    [ModificationChangeType.MIXED]:               'Modificación mixta',
}[type] || type);

const statusLabel = (status) => ({
    [ModificationRequestStatus.PENDING_REVIEW]: 'Pendiente de revisión',
    [ModificationRequestStatus.APPLIED]:        'Aplicada',
    [ModificationRequestStatus.REJECTED]:       'Rechazada',
}[status] || status);

module.exports = {
    canModifyShipment,
    parseModificationPayload,
    submitPortalModification,
    approveRequest,
    rejectRequest,
    listByShipment,
    listPending,
    changeTypeLabel,
    statusLabel,
    describeChanges,
};
