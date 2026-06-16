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

const propagate = async ({ shipment, originIncidentId, userId = null }) => {
    const found = await findActiveStop(shipment.id);
    if (!found) { return { affected: [] }; }
    const { stop, route } = found;

    // Envíos pendientes POSTERIORES de la misma ruta (Esc.1).
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

    const affected = [];
    for (const ls of laterStops) {
        const sh = await Shipment.findByPk(ls.shipmentId);
        if (!sh || TERMINAL.includes(sh.statusId)) { continue; }   // Esc.2 — no toca entregados/cancelados.
        if (sh.delayOriginIncidentId) { continue; }                // idempotente — ya propagado.

        await sh.update({ delayNotifiedAt: new Date(), delayOriginIncidentId: originIncidentId });
        await shipmentHistoryModel.create({
            shipmentId:   sh.id,
            fromStatusId: sh.statusId,
            toStatusId:   sh.statusId,
            eventType:    ShipmentHistoryEvent.DELAY_PROPAGATED,
            comment:      `Demora propagada desde la incidencia #${originIncidentId} de otro envío de la ruta #${route.id}.`,
            userId:       userId,
        });
        // Aviso al destinatario afectado (Esc.3), best-effort.
        require('../controllers/shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, sh.id)
            .catch((e) => console.error('[delayPropagation] notify:', e.message));
        affected.push(sh.id);
    }
    return { affected, routeId: route.id };
};

module.exports = { propagate, findActiveStop };
