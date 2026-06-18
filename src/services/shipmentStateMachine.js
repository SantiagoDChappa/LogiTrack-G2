const sequelize = require('../database/connection');
const shipmentModel = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { Status, RoleType } = require('../constants/enums');

// Mantiene en sincronía RouteStop ↔ Shipment. Cuando un envío llega a un estado final
// (entregado / fallido / cancelado), las paradas de ruta pendientes asociadas se cierran
// dentro de la misma transacción para que el ruteo refleje el estado real del envío.
const ROUTE_CLOSING_STATUSES = new Set([
    Status.DELIVERED.id,
    Status.FAILED_ATTEMPT.id,
    Status.PACKAGE_FAILED.id,
    Status.CANCELLED.id,
]);
const syncRouteStopForShipment = async (shipmentId, toStatusId, transaction) => {
    if (!ROUTE_CLOSING_STATUSES.has(toStatusId)) { return; }
    const { RouteStop } = require('../models/routeStop');
    await RouteStop.update(
        { completed: true, completedAt: new Date() },
        { where: { shipmentId, stopType: 'delivery', completed: false }, transaction }
    );
};

const S = Status;
const R = RoleType;

const STATUS_LABELS = {
    [S.PENDING.id]: 'Pendiente',
    [S.IN_TRANSIT.id]: 'En tránsito',
    [S.AT_BRANCH.id]: 'En sucursal',
    [S.DELIVERED.id]: 'Entregado',
    [S.CANCELLED.id]: 'Cancelado',
    [S.ASSIGNED.id]: 'Asignado',
    [S.IN_PREPARATION.id]: 'En preparación',
    [S.PACKAGE_FAILED.id]: 'Paquete fallido',
    [S.FAILED_ATTEMPT.id]: 'Intento fallido',
    [S.RETURNED.id]: 'Devuelto',
};

// Mensajes orientados al cliente (portal publico). Sin info interna: ni actor, ni hora, ni ruta interna.
const buildAutoComment = ({ fromStatusId, toStatusId }) => {
    if (toStatusId === S.ASSIGNED.id) {
        return 'Tu envío fue asignado a un repartidor.';
    }
    if (toStatusId === S.IN_PREPARATION.id) {
        return 'Tu envío está siendo preparado en sucursal.';
    }
    if (toStatusId === S.IN_TRANSIT.id) {
        if (fromStatusId === S.FAILED_ATTEMPT.id) {
            return 'El repartidor está en camino nuevamente con tu envío.';
        }
        return 'Tu envío está en camino.';
    }
    if (toStatusId === S.AT_BRANCH.id) {
        return 'Tu envío llegó a una sucursal.';
    }
    if (toStatusId === S.DELIVERED.id) {
        return 'Tu envío fue entregado.';
    }
    if (toStatusId === S.FAILED_ATTEMPT.id) {
        return 'No fue posible entregar tu envío. Se reintentará.';
    }
    if (toStatusId === S.PACKAGE_FAILED.id) {
        return 'Tu envío tuvo un problema. Comunicate con atención al cliente.';
    }
    if (toStatusId === S.CANCELLED.id) {
        return 'Tu envío fue cancelado.';
    }
    const to = STATUS_LABELS[toStatusId] || `Estado ${toStatusId}`;
    return `Estado actualizado: ${to}.`;
};

const TRANSITIONS = {
    [S.PENDING.id]:        [S.ASSIGNED.id, S.CANCELLED.id],
    [S.ASSIGNED.id]:       [S.IN_PREPARATION.id, S.IN_TRANSIT.id, S.DELIVERED.id, S.CANCELLED.id],
    [S.IN_PREPARATION.id]: [S.IN_TRANSIT.id, S.PACKAGE_FAILED.id, S.CANCELLED.id],
    [S.IN_TRANSIT.id]:     [S.AT_BRANCH.id, S.DELIVERED.id, S.FAILED_ATTEMPT.id, S.PACKAGE_FAILED.id, S.CANCELLED.id],
    [S.AT_BRANCH.id]:      [S.ASSIGNED.id, S.PACKAGE_FAILED.id],
    [S.FAILED_ATTEMPT.id]: [S.IN_TRANSIT.id, S.AT_BRANCH.id, S.PACKAGE_FAILED.id],
    [S.DELIVERED.id]:      [],
    [S.CANCELLED.id]:      [],
    [S.PACKAGE_FAILED.id]: [],
    [S.RETURNED.id]:       [],
};

const RULES_TARGETED = {
    [`${S.PENDING.id}->${S.ASSIGNED.id}`]:               { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'ASSIGNED',          label: 'Asignar repartidor',     endpoint: '/shipment/update/:id/assign' },
    [`${S.AT_BRANCH.id}->${S.ASSIGNED.id}`]:             { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'REASSIGNED',        label: 'Reasignar repartidor',   endpoint: '/shipment/update/:id/assign' },
    [`${S.ASSIGNED.id}->${S.IN_PREPARATION.id}`]:        { roles: [R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'STATUS_CHANGE',     label: 'Iniciar preparacion',    endpoint: '/shipment/update/:id/prepare' },
    [`${S.IN_PREPARATION.id}->${S.IN_TRANSIT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'PICKUP_CONFIRMED',  label: 'Confirmar retiro',       endpoint: '/scan/:trackingId/pickup' },
    [`${S.ASSIGNED.id}->${S.IN_TRANSIT.id}`]:            { roles: [R.DELIVERY.id, R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'ROUTE_DISPATCHED', label: 'Salida de ruta',         endpoint: '/route/scan/:id/dispatch' },
    [`${S.ASSIGNED.id}->${S.DELIVERED.id}`]:              { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'DELIVERED',         label: 'Confirmar entrega',      endpoint: '/delivery/evidence/:id/pod' },
    [`${S.IN_TRANSIT.id}->${S.DELIVERED.id}`]:           { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'DELIVERED',         label: 'Confirmar entrega',      endpoint: '/delivery/evidence/:id/pod' },
    [`${S.IN_TRANSIT.id}->${S.AT_BRANCH.id}`]:           { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'STATUS_CHANGE',     label: 'Marcar en sucursal',     endpoint: '/scan/:trackingId/at-branch' },
    [`${S.IN_TRANSIT.id}->${S.FAILED_ATTEMPT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: true,  eventType: 'FAILED_ATTEMPT',    label: 'Reportar intento fallido', endpoint: '/scan/:trackingId/failed-attempt' },
    [`${S.FAILED_ATTEMPT.id}->${S.IN_TRANSIT.id}`]:      { roles: [R.DELIVERY.id],               requireComment: false, eventType: 'RETRY',             label: 'Reintentar entrega',     endpoint: '/scan/:trackingId/retry' },
    [`${S.FAILED_ATTEMPT.id}->${S.AT_BRANCH.id}`]:       { roles: [R.DELIVERY.id, R.SUPERVISOR.id, R.ADMIN.id], requireComment: false, eventType: 'RETURNED_TO_BRANCH', label: 'Devolver a sucursal',    endpoint: '/delivery/route/:id/return-scan' },
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

const transition = ({ shipmentId, toStatusId, actor, comment, branchId, deliveryUserId, eventTypeOverride, latitude, longitude, notificationEventOverride }) => {
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
            ...(toStatusId === S.AT_BRANCH.id && branchId ? { currentBranchId: branchId } : {}),
        });

        await syncRouteStopForShipment(shipmentId, toStatusId, t);

        const finalComment = comment && String(comment).trim()
            ? String(comment).trim()
            : buildAutoComment({ fromStatusId, toStatusId, actor, extras: { branchName: undefined } });

        await shipmentHistoryModel.create({
            shipmentId,
            fromStatusId,
            toStatusId,
            comment: finalComment,
            userId: actor.id || null,
            eventType: eventTypeOverride || rule.eventType,
            branchId: branchId || null,
            latitude:  latitude  !== null && latitude  !== undefined ? latitude  : null,
            longitude: longitude !== null && longitude !== undefined ? longitude : null,
            transaction: t,
        });

        // Webhook dispatch (fire and forget)
        try {
            const { fire } = require('./webhookDispatcher');
            fire('shipment.status_changed', {
                shipmentId, fromStatusId, toStatusId,
                trackingId: shipment.trackingId,
                comment: finalComment,
                eventType: eventTypeOverride || rule.eventType,
            });
        } catch { /* ignore */ }

        return { ok: true, fromStatusId, toStatusId, eventType: eventTypeOverride || rule.eventType };
    }).then(async (result) => {
        // Notificacion por email (fuera de la transaccion, fire and forget).
        try {
            const { getEventCodeByShipmentStatus } = require('../models/notificationEvents');
            // notificationEventOverride permite disparar una variante (ej. SHIPMENT_PACKAGE_FAILED_DELAY)
            // en vez del evento genérico mapeado por estado destino.
            const eventCode = notificationEventOverride || getEventCodeByShipmentStatus(result.toStatusId);
            if (eventCode) {
                const shipmentCtrl = require('../controllers/shipment');
                shipmentCtrl.notifyShipmentEvent(eventCode, shipmentId)
                    .catch(e => console.error('[stateMachine] notify:', e.message));
            }
        } catch (e) {
            console.error('[stateMachine] notify dispatch error:', e.message);
        }

        // Sprint 5 — al entregar, completa actualDays/wasDelayed en la predicción para el dashboard analítico.
        if (result.toStatusId === S.DELIVERED.id) {
            try {
                const ShipmentHistory = require('../models/shipmentHistory');
                const { ShipmentPrediction, updateActualResult } = require('../models/shipmentPrediction');
                const startEntry = await ShipmentHistory.findOne({
                    where: { shipmentId, toStatusId: S.IN_TRANSIT.id },
                    order: [['changedAt', 'ASC']],
                });
                if (startEntry) {
                    const actualDays = Math.max(1, Math.ceil((Date.now() - new Date(startEntry.changedAt).getTime()) / 86_400_000));
                    const pred = await ShipmentPrediction.findOne({
                        where: { shipmentId },
                        order: [['createdAt', 'DESC']],
                    });
                    if (pred && pred.actualDays === null) {
                        await updateActualResult(shipmentId, actualDays, actualDays > pred.predictedDays);
                    }
                }
            } catch (e) {
                console.error('[stateMachine] actualDays update error:', e.message);
            }
        }

        return result;
    });
};

const assignDelivery = ({ shipmentId, deliveryUserId, actor, branchId, latitude, longitude }) => {
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
            comment:   buildAutoComment({ fromStatusId, toStatusId: S.ASSIGNED.id, actor }),
            userId:    actor.id || null,
            eventType: rule.eventType,
            branchId:  branchId  || null,
            latitude:  latitude  != null ? latitude  : null,
            longitude: longitude != null ? longitude : null,
            transaction: t,
        });

        return { ok: true, fromStatusId, toStatusId: S.ASSIGNED.id, eventType: rule.eventType };
    }).then(async (result) => {
        try {
            const { getEventCodeByShipmentStatus } = require('../models/notificationEvents');
            const eventCode = getEventCodeByShipmentStatus(result.toStatusId);
            if (eventCode) {
                const shipmentCtrl = require('../controllers/shipment');
                shipmentCtrl.notifyShipmentEvent(eventCode, shipmentId)
                    .catch(e => console.error('[stateMachine] notify (assign):', e.message));
            }
        } catch (e) {
            console.error('[stateMachine] notify dispatch error (assign):', e.message);
        }
        return result;
    });
};

module.exports = {
    transition,
    assignDelivery,
    canTransition,
    getAvailableActions,
    buildAutoComment,
    StateMachineError,
    TRANSITIONS,
};
