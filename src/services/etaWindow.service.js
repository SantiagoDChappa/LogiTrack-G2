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
    proximityKm:    1,    // radio del aviso "casi llego" por GPS (default 1 km, tope 2)
    proximityKmMax: 2,
    format:         'range',
    rangeMargin:    20,
    avgSpeedKmh:    25,
    serviceMinDef:  5,
};

async function loadConfig() {
    const [prox, fmt, margin, speed, proxKm] = await Promise.all([
        settingModel.get('eta_proximity_minutes'),
        settingModel.get('eta_format'),
        settingModel.get('eta_range_margin_minutes'),
        settingModel.get('eta_avg_speed_kmh'),
        settingModel.get('eta_proximity_km'),
    ]);
    const num = (v, def) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : def; };
    // El radio del aviso se topea en proximityKmMax (parametrizable hasta 2 km).
    const km = num(proxKm, DEFAULTS.proximityKm);
    return {
        proximityMin: num(prox, DEFAULTS.proximityMin),
        proximityKm:  Math.min(km, DEFAULTS.proximityKmMax),
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

// Despacha el aviso "sos la próxima entrega" (SHIPMENT_NEXT_DELIVERY) para una parada:
// recalcula su franja, marca idempotencia (route_stop.next_notified), manda el mail con
// el link al mapa en vivo y abre el chat. Devuelve true si avisó, false si no correspondía
// (ya avisada, sin ETA, o ganó una carrera). Lo comparten los disparadores (hoy: GPS).
async function dispatchNextDelivery(route, next, cfg) {
    const etas = await computeEtas(route, cfg);
    const etaNext = etas.get(next.id);
    if (!etaNext) { return false; }
    const window = formatWindow(etaNext, cfg);

    // Marca ANTES de despachar para no duplicar si entran dos heartbeats casi juntos.
    const { RouteStop } = require('../models/routeStop');
    const [updated] = await RouteStop.update(
        { nextNotified: true },
        { where: { id: next.id, nextNotified: false } }
    );
    if (updated === 0) { return false; } // otro disparo ya avisó

    // "antes de las X": el aviso de próxima entrega usa el tope superior de la franja.
    const etaText = cfg.format === 'exact'
        ? `Tu envío llega cerca de las ${window.fromLabel}.`
        : `Tu envío llega antes de las ${window.toLabel}.`;

    const shipmentCtrl = require('../controllers/shipment');
    const { NotificationEvent, ShipmentHistoryEvent } = require('../constants/enums');
    await shipmentCtrl.notifyShipmentEvent(NotificationEvent.SHIPMENT_NEXT_DELIVERY, next.shipmentId, {
        etaText,
        etaFrom: window.fromLabel,
        etaTo:   window.toLabel,
    });

    // Timeline paso-a-paso (misEnviosDetail y /track/:trackingId lo consumen vía
    // shipmentStatusView.buildTimeline). Sin cambio de estado real: from=to=statusId.
    // eventType STATUS_CHANGE porque no hay entrada dedicada en ShipmentHistoryEvent y no
    // amerita migración para un solo caso.
    try {
        const shipmentHistoryModel = require('../models/shipmentHistory');
        const { Shipment } = require('../models/shipment');
        const s = await Shipment.findByPk(next.shipmentId, { attributes: ['statusId'] });
        const currentStatus = s?.statusId || null;
        await shipmentHistoryModel.create({
            shipmentId:   next.shipmentId,
            fromStatusId: currentStatus,
            toStatusId:   currentStatus,
            comment:      `Sos la próxima entrega. ${etaText}`,
            userId:       null,
            eventType:    ShipmentHistoryEvent.STATUS_CHANGE,
        });
    } catch (e) { console.error('[eta] history NEXT_DELIVERY:', e.message); }

    // Chat: abrir el canal del envío que viene ya, así el cliente puede coordinar apenas
    // recibe el aviso (no esperamos a que el repartidor llegue físicamente).
    require('./deliveryChat.service').ensureOpen(next.shipmentId, next.id)
        .catch(e => console.error('[chat] ensureOpen next:', e.message));
    return true;
}

// Aviso "sos la próxima entrega" disparado por GPS/DISTANCIA. Se llama en cada heartbeat con
// la posición actual del repartidor: si está a ≤ proximityKm (config, default 1 km, tope 2)
// de la PRÓXIMA parada pendiente, le avisa por mail al destinatario con su franja horaria +
// link al mapa en vivo.
//
// Por qué por distancia: el aviso debe salir cuando el repartidor está físicamente cerca,
// no antes. Requiere el GPS prendido (obligatorio para rutear), así que el disparo es fiable.
//
// Idempotente por parada vía route_stop.next_notified: cada parada se avisa UNA sola vez.
async function notifyOnProximity(routeId, lat, lng) {
    if (!routeId || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) { return; }
    const routeModel = require('../models/route');
    const route = await routeModel.getById(routeId);
    if (!route || route.statusId !== routeModel.RouteStatus.IN_ROUTE) { return; }

    const cfg = await loadConfig();
    const pending = pendingDeliveryStops(route);
    if (pending.length === 0) { return; } // no quedan entregas por delante

    const next = pending[0];
    if (next.nextNotified) { return; } // ya avisado

    const coords = stopCoords(next);
    if (!coords) { return; } // sin coordenadas de la parada no se puede medir distancia

    const km = haversine(Number(lat), Number(lng), coords.lat, coords.lng);
    if (km > cfg.proximityKm) { return; } // todavía lejos

    await dispatchNextDelivery(route, next, cfg);
}

module.exports = {
    loadConfig,
    latestDriverPosition,
    pendingDeliveryStops,
    computeEtas,
    formatWindow,
    persistPromisedEtas,
    etaForShipment,
    notifyOnProximity,
    DEFAULTS,
};
