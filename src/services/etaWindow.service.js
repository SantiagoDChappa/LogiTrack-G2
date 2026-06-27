// Última Milla — motor de ETA (hora estimada de llegada) por parada de ruteo.
// Una sola lógica alimenta:
//   - el box de seguimiento en el portal del cliente (franja viva, se recalcula),
//   - el aviso por mail "ya casi llego" (SHIPMENT_NEXT_DELIVERY), disparado por GPS.
//
// Idea: desde dónde está el repartidor AHORA (última posición GPS) recorre las paradas
// pendientes en orden, sumando tiempo de viaje (distancia/velocidad) + tiempo de
// atención por parada. Si no hay GPS aún, ancla en la sucursal de origen.
//
// Config editable (tabla setting, ver migración 068):
//   eta_proximity_minutes   minutos de anticipación del aviso "casi llego" (default 4)
//   eta_format              'exact' | 'range'  (hora exacta o franja)
//   eta_range_margin_minutes  margen superior de la franja (default 20)
//   eta_avg_speed_kmh       velocidad asumida si el GPS no reporta (default 25)

const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');
const { haversine } = require('../utils/geo');
const settingModel = require('../models/setting');

const DEFAULTS = {
    proximityMin:   4,
    format:         'range',
    rangeMargin:    20,
    avgSpeedKmh:    25,
    serviceMinDef:  5,
};

async function loadConfig() {
    const [prox, fmt, margin, speed] = await Promise.all([
        settingModel.get('eta_proximity_minutes'),
        settingModel.get('eta_format'),
        settingModel.get('eta_range_margin_minutes'),
        settingModel.get('eta_avg_speed_kmh'),
    ]);
    const num = (v, def) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : def; };
    return {
        proximityMin: num(prox, DEFAULTS.proximityMin),
        format:       fmt === 'exact' ? 'exact' : 'range',
        rangeMargin:  num(margin, DEFAULTS.rangeMargin),
        avgSpeedKmh:  num(speed, DEFAULTS.avgSpeedKmh),
        serviceMinDef: DEFAULTS.serviceMinDef,
    };
}

// Última posición conocida del repartidor de una ruta (o null).
// driver_position.route_id lo puebla el heartbeat (route.ejs manda routeId), así que
// no hace falta el join a transport (que además usa columnas camelCase inexistentes).
async function latestDriverPosition(routeId) {
    const rows = await sequelize.query(
        `SELECT latitude::float lat, longitude::float lng, speed_kmh::float speed, recorded_at AS at
           FROM logitrack.driver_position
          WHERE route_id = :rid
          ORDER BY recorded_at DESC LIMIT 1`,
        { replacements: { rid: Number(routeId) }, type: QueryTypes.SELECT }
    );
    return rows[0] || null;
}

function stopCoords(stop) {
    const lat = stop.lat != null ? Number(stop.lat) : Number(stop.shipment?.address?.lat);
    const lng = stop.lng != null ? Number(stop.lng) : Number(stop.shipment?.address?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { return null; }
    return { lat, lng };
}

// Paradas de entrega pendientes (no completadas, no salteadas), en orden de visita.
function pendingDeliveryStops(route) {
    return (route.stops || [])
        .filter(s => s.stopType === 'delivery' && s.shipmentId && !s.completed && !s.skipped)
        .sort((a, b) => a.sequence - b.sequence);
}

// Calcula la hora estimada de llegada de cada parada pendiente.
// Devuelve Map<stopId, Date>. `route` debe venir de routeModel.getById (incluye stops, origin).
async function computeEtas(route, cfg) {
    const config = cfg || await loadConfig();
    const pending = pendingDeliveryStops(route);
    const result = new Map();
    if (pending.length === 0) { return result; }

    const pos = await latestDriverPosition(route.id);
    let cursor;
    let speed = config.avgSpeedKmh;
    if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
        cursor = { lat: pos.lat, lng: pos.lng };
        if (Number.isFinite(pos.speed) && pos.speed > 5) { speed = pos.speed; }
    } else if (route.originBranch?.latitude != null) {
        cursor = { lat: Number(route.originBranch.latitude), lng: Number(route.originBranch.longitude) };
    } else {
        const first = stopCoords(pending[0]);
        if (!first) { return result; }
        cursor = first;
    }

    let t = Date.now();
    for (const stop of pending) {
        const coords = stopCoords(stop);
        if (!coords) { continue; }
        const km = haversine(cursor.lat, cursor.lng, coords.lat, coords.lng);
        const travelMin = (km / speed) * 60;
        t += travelMin * 60000;
        result.set(stop.id, new Date(t));
        const serviceMin = Number(stop.estimatedMinutes) || config.serviceMinDef;
        t += serviceMin * 60000;
        cursor = coords;
    }
    return result;
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Da el texto de llegada para una fecha estimada según la config (exacta o franja).
// delayed=true cambia el tono: pide disculpas y promete un tope.
function formatWindow(etaDate, cfg, { delayed = false } = {}) {
    if (!etaDate) { return null; }
    if (cfg.format === 'exact') {
        const text = delayed
            ? `Perdón por la demora. Tu envío llega cerca de las ${hhmm(etaDate)}.`
            : `Tu envío llega cerca de las ${hhmm(etaDate)}.`;
        return { from: etaDate, to: etaDate, fromLabel: hhmm(etaDate), toLabel: hhmm(etaDate), text };
    }
    const to = new Date(etaDate.getTime() + cfg.rangeMargin * 60000);
    const text = delayed
        ? `Perdón por la demora. Tu envío llega antes de las ${hhmm(to)}.`
        : `Tu envío llega entre las ${hhmm(etaDate)} y las ${hhmm(to)}.`;
    return { from: etaDate, to, fromLabel: hhmm(etaDate), toLabel: hhmm(to), text };
}

// Persiste la "promesa" inicial (route_stop.eta_at) al iniciar la ruta. Esa promesa es
// el tope contra el que después se mide el atraso.
async function persistPromisedEtas(route) {
    const cfg = await loadConfig();
    const etas = await computeEtas(route, cfg);
    const { RouteStop } = require('../models/routeStop');
    await Promise.all([...etas.entries()].map(([stopId, date]) =>
        RouteStop.update({ etaAt: date }, { where: { id: stopId } })
    ));
    return etas;
}

// API de alto nivel para portal y notificaciones: estado de llegada de UN envío.
// Devuelve null si el envío no está en una ruta activa con ETA calculable.
async function etaForShipment(shipmentId) {
    const routeModel = require('../models/route');
    const { Route, RouteStatus } = routeModel;
    const { RouteStop } = require('../models/routeStop');
    const sid = Number(shipmentId);

    // Vía modelos (manejan el mapeo a snake_case): la ruta activa más reciente del envío.
    const stopRows = await RouteStop.findAll({
        where: { shipmentId: sid, stopType: 'delivery' },
        attributes: ['routeId'],
    });
    if (stopRows.length === 0) { return null; }
    const route0 = await Route.findOne({
        where: { id: stopRows.map(s => s.routeId), statusId: [RouteStatus.PLANNED, RouteStatus.IN_ROUTE] },
        order: [['createdAt', 'DESC']],
        attributes: ['id'],
    });
    if (!route0) { return null; }
    const routeId = route0.id;

    const route = await routeModel.getById(routeId);
    if (!route) { return null; }
    const stop = (route.stops || []).find(s => s.shipmentId === sid && s.stopType === 'delivery');
    if (!stop || stop.completed || stop.skipped) { return null; }

    const cfg = await loadConfig();
    const etas = await computeEtas(route, cfg);
    const etaDate = etas.get(stop.id);
    if (!etaDate) { return null; }

    // Atraso: la promesa inicial (eta_at) ya pasó o quedó corta frente al recálculo vivo.
    const promised = stop.etaAt ? new Date(stop.etaAt) : null;
    const delayed = promised ? etaDate.getTime() > promised.getTime() + 60000 : false;

    const window = formatWindow(etaDate, cfg, { delayed });
    return {
        routeId,
        stopId: stop.id,
        etaIso: etaDate.toISOString(),
        delayed,
        promisedIso: promised ? promised.toISOString() : null,
        text: window.text,
        fromLabel: window.fromLabel,
        toLabel: window.toLabel,
    };
}

// Aviso "ya casi llego" disparado por GPS. Se llama desde el heartbeat del repartidor:
// cuando está a <= proximityMin de la entrega que tiene en mano (pending[0]), avisa por
// mail al destinatario del envío SIGUIENTE (pending[1]) con su hora estimada + link al
// mapa en vivo. Idempotente vía route_stop.next_notified.
async function maybeNotifyNextDelivery(routeId) {
    if (!routeId) { return; }
    const routeModel = require('../models/route');
    const route = await routeModel.getById(routeId);
    if (!route || route.statusId !== routeModel.RouteStatus.IN_ROUTE) { return; }

    const cfg = await loadConfig();
    const pending = pendingDeliveryStops(route);
    if (pending.length < 2) { return; } // hace falta una "actual" y una "siguiente"

    const etas = await computeEtas(route, cfg);
    const current = pending[0];
    const etaCurrent = etas.get(current.id);
    if (!etaCurrent) { return; }
    const minsToCurrent = (etaCurrent.getTime() - Date.now()) / 60000;
    if (minsToCurrent > cfg.proximityMin) { return; }

    const next = pending[1];
    if (next.nextNotified) { return; }
    const etaNext = etas.get(next.id);
    if (!etaNext) { return; }
    const window = formatWindow(etaNext, cfg);

    // Marca ANTES de despachar para no duplicar si entran dos heartbeats juntos.
    const { RouteStop } = require('../models/routeStop');
    const [updated] = await RouteStop.update(
        { nextNotified: true },
        { where: { id: next.id, nextNotified: false } }
    );
    if (updated === 0) { return; } // otro heartbeat ya disparó

    // "antes de las X": el aviso casi-llego usa el tope superior de la franja.
    const etaText = cfg.format === 'exact'
        ? `Tu envío llega cerca de las ${window.fromLabel}.`
        : `Tu envío llega antes de las ${window.toLabel}.`;

    const shipmentCtrl = require('../controllers/shipment');
    const { NotificationEvent } = require('../constants/enums');
    await shipmentCtrl.notifyShipmentEvent(NotificationEvent.SHIPMENT_NEXT_DELIVERY, next.shipmentId, {
        etaText,
        etaFrom: window.fromLabel,
        etaTo:   window.toLabel,
    });

    // Chat: abrir el canal del envío siguiente ya, así el cliente puede coordinar apenas
    // recibe el aviso (no esperamos a que el repartidor llegue físicamente).
    require('./deliveryChat.service').ensureOpen(next.shipmentId, next.id)
        .catch(e => console.error('[chat] ensureOpen next:', e.message));
}

module.exports = {
    loadConfig,
    latestDriverPosition,
    pendingDeliveryStops,
    computeEtas,
    formatWindow,
    persistPromisedEtas,
    etaForShipment,
    maybeNotifyNextDelivery,
    DEFAULTS,
};
