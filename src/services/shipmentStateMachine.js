const sequelize = require('../database/connection');
const shipmentModel = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { Status, RoleType } = require('../constants/enums');

const S = Status;
const R = RoleType;

const TRANSITIONS = {
    [S.PENDING.id]:        [S.ASSIGNED.id, S.CANCELLED.id],
    [S.ASSIGNED.id]:       [S.IN_PREPARATION.id, S.CANCELLED.id],
    [S.IN_PREPARATION.id]: [S.IN_TRANSIT.id, S.PACKAGE_FAILED.id, S.CANCELLED.id],
    [S.IN_TRANSIT.id]:     [S.AT_BRANCH.id, S.DELIVERED.id, S.FAILED_ATTEMPT.id, S.PACKAGE_FAILED.id, S.CANCELLED.id],
    [S.AT_BRANCH.id]:      [S.ASSIGNED.id, S.PACKAGE_FAILED.id],
    [S.FAILED_ATTEMPT.id]: [S.IN_TRANSIT.id, S.PACKAGE_FAILED.id],
    [S.DELIVERED.id]:      [],
    [S.CANCELLED.id]:      [],
    [S.PACKAGE_FAILED.id]: [],
};

const RULES_TARGETED = {
    [`${S.PENDING.id}->${S.ASSIGNED.id}`]:               { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'ASSIGNED',          label: 'Asignar repartidor',     endpoint: '/shipment/update/:id/assign' },
    [`${S.AT_BRANCH.id}->${S.ASSIGNED.id}`]:             { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'REASSIGNED',        label: 'Reasignar repartidor',   endpoint: '/shipment/update/:id/assign' },
    [`${S.ASSIGNED.id}->${S.IN_PREPARATION.id}`]:        { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'STATUS_CHANGE',     label: 'Iniciar preparacion',    endpoint: '/shipment/update/:id/prepare' },
    [`${S.IN_PREPARATION.id}->${S.IN_TRANSIT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'PICKUP_CONFIRMED',  label: 'Confirmar retiro',       endpoint: '/scan/:trackingId/pickup' },
    [`${S.IN_TRANSIT.id}->${S.DELIVERED.id}`]:           { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'DELIVERED',         label: 'Confirmar entrega',      endpoint: '/delivery/evidence/:id/pod' },
    [`${S.IN_TRANSIT.id}->${S.AT_BRANCH.id}`]:           { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'STATUS_CHANGE',     label: 'Marcar en sucursal',     endpoint: '/scan/:trackingId/at-branch' },
    [`${S.IN_TRANSIT.id}->${S.FAILED_ATTEMPT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: true,  eventType: 'FAILED_ATTEMPT',    label: 'Reportar intento fallido', endpoint: '/scan/:trackingId/failed-attempt' },
    [`${S.FAILED_ATTEMPT.id}->${S.IN_TRANSIT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'RETRY',             label: 'Reintentar entrega',     endpoint: '/scan/:trackingId/retry' },
};

const RULE_PACKAGE_FAILED = {
    roles: [R.DELIVERY.id, R.SUPERVISOR.id, R.ADMIN.id],
    requireComment: true,
    eventType: 'PACKAGE_FAILED',
    label: 'Marcar paquete fallido',
    endpointByRole: {
        [R.DELIVERY.id]:   '/scan/:trackingId/package-failed',
        [R.SUPERVISOR.id]: '/shipment/update/:id/mark-failed',
        [R.ADMIN.id]:      '/shipment/update/:id/mark-failed',
    },
};

const RULE_CANCELLED = {
    roles: [R.SUPERVISOR.id, R.ADMIN.id],
    requireComment: true,
    eventType: 'CANCELLED',
    label: 'Cancelar envio',
    endpoint: '/shipment/update/:id/cancel',
};

class StateMachineError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'StateMachineError';
        this.code = code;
    }
}

const getRule = (fromStatusId, toStatusId, actorRoleId) => {
    if (toStatusId === S.PACKAGE_FAILED.id) {
        const ep = RULE_PACKAGE_FAILED.endpointByRole[actorRoleId] || RULE_PACKAGE_FAILED.endpointByRole[R.DELIVERY.id];
        return { ...RULE_PACKAGE_FAILED, endpoint: ep };
    }
    if (toStatusId === S.CANCELLED.id) {
        return RULE_CANCELLED;
    }
    return RULES_TARGETED[`${fromStatusId}->${toStatusId}`] || null;
};

const canTransition = ({ fromStatusId, toStatusId, actorRoleId }) => {
    const allowed = TRANSITIONS[fromStatusId];
    if (!allowed || !allowed.includes(toStatusId)) { return false; }
    const rule = getRule(fromStatusId, toStatusId, actorRoleId);
    if (!rule) { return false; }
    if (actorRoleId !== undefined && !rule.roles.includes(actorRoleId)) { return false; }
    return true;
};

const getAvailableActions = ({ shipment, actor }) => {
    const fromStatusId = shipment.statusId;
    const allowed = TRANSITIONS[fromStatusId] || [];
    const actorRoleId = actor && actor.roleId;
    const actions = [];
    for (const toStatusId of allowed) {
        const rule = getRule(fromStatusId, toStatusId, actorRoleId);
        if (!rule) { continue; }
        if (actorRoleId !== undefined && !rule.roles.includes(actorRoleId)) { continue; }
        actions.push({
            toStatusId,
            label: rule.label,
            eventType: rule.eventType,
            requireComment: rule.requireComment,
            endpoint: rule.endpoint,
        });
    }
    return actions;
};

const transition = ({ shipmentId, toStatusId, actor, comment, branchId, deliveryUserId, eventTypeOverride }) => {
    if (!actor || actor.roleId === undefined) {
        return Promise.reject(new StateMachineError('FORBIDDEN_ROLE', 'Actor sin rol'));
    }

    return sequelize.transaction(async (t) => {
        const shipment = await shipmentModel.findByIdForUpdate(shipmentId, t);
        if (!shipment) {
            throw new StateMachineError('SHIPMENT_NOT_FOUND', 'Envio no encontrado');
        }

        const fromStatusId = shipment.statusId;
        const allowed = TRANSITIONS[fromStatusId] || [];
        if (!allowed.includes(toStatusId)) {
            throw new StateMachineError('INVALID_TRANSITION', `Transicion ${fromStatusId}->${toStatusId} no permitida`);
        }

        const rule = getRule(fromStatusId, toStatusId, actor.roleId);
        if (!rule) {
            throw new StateMachineError('INVALID_TRANSITION', `Sin regla para ${fromStatusId}->${toStatusId}`);
        }
        if (!rule.roles.includes(actor.roleId)) {
            throw new StateMachineError('FORBIDDEN_ROLE', 'Rol no autorizado para esta transicion');
        }
        if (rule.requireComment && (!comment || !String(comment).trim())) {
            throw new StateMachineError('COMMENT_REQUIRED', 'Motivo obligatorio');
        }

        await shipmentModel.updateStatus(shipmentId, toStatusId, {
            transaction: t,
            ...(deliveryUserId !== undefined ? { deliveryUserId } : {}),
        });

        await shipmentHistoryModel.create({
            shipmentId,
            fromStatusId,
            toStatusId,
            comment: comment ? String(comment).trim() : null,
            userId: actor.id || null,
            eventType: eventTypeOverride || rule.eventType,
            branchId: branchId || null,
            transaction: t,
        });

        return { ok: true, fromStatusId, toStatusId, eventType: eventTypeOverride || rule.eventType };
    });
};

const assignDelivery = ({ shipmentId, deliveryUserId, actor }) => {
    return sequelize.transaction(async (t) => {
        const shipment = await shipmentModel.findByIdForUpdate(shipmentId, t);
        if (!shipment) {
            throw new StateMachineError('SHIPMENT_NOT_FOUND', 'Envio no encontrado');
        }
        const fromStatusId = shipment.statusId;

        if (fromStatusId !== S.PENDING.id && fromStatusId !== S.AT_BRANCH.id) {
            await shipmentModel.Shipment.update(
                { deliveryUserId: deliveryUserId || null },
                { where: { id: shipmentId }, transaction: t }
            );
            return { ok: true, fromStatusId, toStatusId: fromStatusId, eventType: 'ASSIGN_ONLY' };
        }

        const rule = getRule(fromStatusId, S.ASSIGNED.id, actor && actor.roleId);
        if (!rule || !rule.roles.includes(actor.roleId)) {
            throw new StateMachineError('FORBIDDEN_ROLE', 'Rol no autorizado para asignar');
        }

        await shipmentModel.updateStatus(shipmentId, S.ASSIGNED.id, {
            transaction: t,
            deliveryUserId: deliveryUserId || null,
        });

        await shipmentHistoryModel.create({
            shipmentId,
            fromStatusId,
            toStatusId: S.ASSIGNED.id,
            comment: null,
            userId: actor.id || null,
            eventType: rule.eventType,
            transaction: t,
        });

        return { ok: true, fromStatusId, toStatusId: S.ASSIGNED.id, eventType: rule.eventType };
    });
};

module.exports = {
    transition,
    assignDelivery,
    canTransition,
    getAvailableActions,
    StateMachineError,
    TRANSITIONS,
};
