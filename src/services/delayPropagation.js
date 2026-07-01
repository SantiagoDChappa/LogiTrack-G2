// LGT-209 — propaga la demora a los envíos pendientes posteriores de la misma ruta.
// Disparador: el repartidor confirma una incidencia de demora sobre un envío en ruta.
// No toca entregados/cancelados (Esc.2), avisa a cada destinatario (Esc.3) y deja
// trazabilidad del origen en el historial de cada envío afectado (Esc.4). Idempotente.
const { Op } = require('sequelize');
const { RouteStop } = require('../models/routeStop');
const { Route, RouteStatus } = require('../models/route');
const { Shipment } = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { Status, ShipmentHistoryEvent, NotificationEvent } = require('../constants/enums');

const TERMINAL = [Status.DELIVERED.id, Status.CANCELLED.id];

// Parada de entrega del envío dentro de una ruta activa (PLANNED / IN_ROUTE).
const findActiveStop = async (shipmentId) => {
    const stops = await RouteStop.findAll({ where: { shipmentId, stopType: 'delivery' } });
    for (const s of stops) {
        const route = await Route.findByPk(s.routeId);
        if (route && [RouteStatus.PLANNED, RouteStatus.IN_ROUTE].includes(route.statusId)) {
            return { stop: s, route };
        }
    }
    return null;
};

// Loop interno reutilizable: marca cada stop pendiente como demorado, escribe historial
// cliente-friendly, dispara la notificación y ABRE una incidencia formal (tipo DELAY)
// por cada envío afectado. Idempotente por shipment (delayOriginIncidentId) + dedup interna
// de autoCreateIncident (no duplica DELAY abierto).
const _markStops = async (stops, route, originIncidentId, userId, context = {}) => {
    const affected = [];
    for (const ls of stops) {
        const sh = await Shipment.findByPk(ls.shipmentId);
        if (!sh || TERMINAL.includes(sh.statusId)) { continue; }   // Esc.2 — no toca entregados/cancelados.
        if (sh.delayOriginIncidentId) { continue; }                // idempotente — ya propagado.

        await sh.update({ delayNotifiedAt: new Date(), delayOriginIncidentId: originIncidentId });
        await shipmentHistoryModel.create({
            shipmentId:   sh.id,
            fromStatusId: sh.statusId,
            toStatusId:   sh.statusId,
            eventType:    ShipmentHistoryEvent.DELAY_PROPAGATED,
            // Texto cliente-friendly: aparece en el paso a paso ML-style de misEnviosDetail
            // y /track/:trackingId. Sin "incidencia #X" ni "ruta #Y" (jerga interna).
            comment:      'Tu envío tiene una demora. El repartidor reportó un contratiempo en su recorrido; estamos actualizando la hora estimada.',
            userId:       userId,
        });
        // Aviso al destinatario afectado (Esc.3), best-effort.
        require('../controllers/shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, sh.id)
            .catch((e) => console.error('[delayPropagation] notify:', e.message));

        // Incidencia formal (tipo DELAY) por envío — queda visible en el módulo de
        // Incidencias para operador/supervisor. autoCreateIncident dedupa: si ya hay
        // un DELAY abierto para este envío, no crea otro.
        try {
            const { autoCreateIncident } = require('./incidentAutoGen');
            const desc = context.incidentType && context.severity
                ? `Demora propagada por incidente en ruta #${route?.id || ''}: ${context.incidentType} (${context.severity}). Origen ID #${originIncidentId}.`
                : `Demora propagada por incidente en ruta #${route?.id || ''}. Origen ID #${originIncidentId}.`;
            await autoCreateIncident({ shipmentId: sh.id, typeCode: 'DELAY', description: desc }, null);
        } catch (e) { console.error('[delayPropagation] autoCreateIncident:', e.message); }

        affected.push(sh.id);
    }
    return affected;
};

// Propaga desde una incidencia de un envío puntual: marca los envíos POSTERIORES a esa
// parada en la misma ruta (el envío origen ya lleva su marca en la incidencia).
const propagate = async ({ shipment, originIncidentId, userId = null, context = {} }) => {
    const found = await findActiveStop(shipment.id);
    if (!found) { return { affected: [] }; }
    const { stop, route } = found;

    const laterStops = await RouteStop.findAll({
        where: {
            routeId:    route.id,
            stopType:   'delivery',
            sequence:   { [Op.gt]: stop.sequence },
            completed:  false,
            skipped:    false,
            shipmentId: { [Op.ne]: null },
        },
        order: [['sequence', 'ASC']],
    });

    const affected = await _markStops(laterStops, route, originIncidentId, userId, context);
    return { affected, routeId: route.id };
};

// Propaga desde un incidente EN RUTA (RouteIncident, no Incident del envío): afecta a
// TODAS las paradas de entrega pendientes de la ruta, incluida la próxima (la que el
// repartidor iba a hacer). No hay "envío origen" — el disparador es la ruta misma.
// `context` puede llevar { incidentType, severity } para armar la descripción del Incident.
const propagateFromRoute = async ({ route, originIncidentId, userId = null, context = {} }) => {
    if (!route || !route.id) { return { affected: [] }; }
    const pendingStops = await RouteStop.findAll({
        where: {
            routeId:    route.id,
            stopType:   'delivery',
            completed:  false,
            skipped:    false,
            shipmentId: { [Op.ne]: null },
        },
        order: [['sequence', 'ASC']],
    });

    const affected = await _markStops(pendingStops, route, originIncidentId, userId, context);
    return { affected, routeId: route.id };
};

module.exports = { propagate, propagateFromRoute, findActiveStop };
