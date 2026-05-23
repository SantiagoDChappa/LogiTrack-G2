const express = require('express');
const router = express.Router();
const { requireAuth, requireDelivery } = require('../middlewares/auth');
const shipmentModel = require('../models/shipment');
const deliveryController = require('../controllers/delivery');
const routeModel = require('../models/route');
const { RouteStop } = require('../models/routeStop');
const stateMachine = require('../services/shipmentStateMachine');
const { Status } = require('../constants/enums');
const { deliveryValidation, handleCreateValidationErrors } = require('../middlewares/delivery');

// Verifica que todos los stops anteriores estén completados o postergados ("volver luego").
// Las postergadas NO bloquean — el repartidor las atenderá al final.
// Retorna {ok:true} o {ok:false, error, blockingStop}.
function checkStopOrder(route, stopId) {
    const stops = (route.stops || []).slice().sort((a, b) => a.sequence - b.sequence);
    const target = stops.find(s => s.id === Number(stopId));
    if (!target) {return { ok: false, error: 'Stop no encontrado' };}
    // Bloqueante = parada anterior NO completada Y NO postergada
    const blocker = stops.find(s => s.sequence < target.sequence && !s.completed && !s.skipped);
    if (blocker) {
        const kind = blocker.stopType === 'pickup' ? 'el pickup' : `la parada #${blocker.sequence}`;
        return { ok: false, error: `Tenés que completar ${kind} antes de continuar.`, blockingStop: blocker.id };
    }
    return { ok: true, target };
}

router.get('/', requireDelivery, async (req, res) => {
    try {
        const userId = res.locals.currentUser.id;
        const { RouteStatus } = require('../models/route');
        const [shipments, routes] = await Promise.all([
            shipmentModel.search({ deliveryUserId: userId }),
            routeModel.getAllByDriver(userId),
        ]);

        // "Activa" = IN_ROUTE (en curso) o, si no hay, la PLANNED más reciente
        const inRoute = routes.find(r => r.statusId === RouteStatus.IN_ROUTE);
        const planned = routes.filter(r => r.statusId === RouteStatus.PLANNED);
        const finished = routes.filter(r => r.statusId === RouteStatus.FINISHED || r.statusId === RouteStatus.CANCELLED);

        const activeRoute = inRoute || planned[0] || null;
        const upcomingRoutes = planned.filter(r => !activeRoute || r.id !== activeRoute.id);

        // Resumen para el card destacado
        let activeSummary = null;
        if (activeRoute) {
            const stops = activeRoute.stops || [];
            const totalStops = stops.length;
            const completedStops = stops.filter(s => s.completed).length;
            const skippedStops = stops.filter(s => s.skipped && !s.completed).length;
            activeSummary = {
                id: activeRoute.id,
                statusId: activeRoute.statusId,
                statusLabel: activeRoute.statusId === RouteStatus.IN_ROUTE ? 'En curso' : 'Asignada',
                transportName: activeRoute.transport ? activeRoute.transport.name : '',
                originBranch: activeRoute.originBranch ? activeRoute.originBranch.name : '',
                totalDistanceKm: Number(activeRoute.totalDistanceKm || 0),
                startedAt: activeRoute.startedAt,
                totalStops, completedStops, skippedStops,
                progressPct: totalStops ? Math.round((completedStops / totalStops) * 100) : 0,
            };
        }

        const summarizeRoute = (r) => {
            const stops = r.stops || [];
            const totalStops = stops.length;
            const completedStops = stops.filter(s => s.completed).length;
            return {
                id: r.id,
                statusId: r.statusId,
                transportName: r.transport ? r.transport.name : '',
                originBranch: r.originBranch ? r.originBranch.name : '',
                totalDistanceKm: Number(r.totalDistanceKm || 0),
                createdAt: r.createdAt,
                startedAt: r.startedAt,
                finishedAt: r.finishedAt,
                totalStops, completedStops,
            };
        };

        res.render('delivery/home', {
            shipments,
            activeSummary,
            upcomingRoutes: upcomingRoutes.map(summarizeRoute),
            finishedRoutes: finished.map(summarizeRoute),
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.get('/evidence/:id',
    requireAuth,
    requireDelivery,
    deliveryController.showActionScreen
);

router.get('/evidence/:id/pod',
    requireAuth,
    requireDelivery,
    deliveryController.showEvidenceForm
);

router.post('/evidence/:id/pod',
    requireAuth,
    requireDelivery,
    deliveryValidation,
    handleCreateValidationErrors,
    deliveryController.saveEvidence
);

router.get('/failed/:id',
    requireAuth,
    requireDelivery,
    deliveryController.showFailedForm
);

router.post('/failed/:id',
    requireAuth,
    requireDelivery,
    deliveryController.saveFailedAttempt
);

// Vista del repartidor con su ruta optimizada
router.get('/route/:id', requireDelivery, async (req, res) => {
    try {
        const route = await routeModel.getById(req.params.id);
        if (!route) { return res.status(404).send('Ruta no encontrada'); }
        if (route.transport?.driverUserId !== res.locals.currentUser.id) {
            return res.status(403).send('Esta ruta no te pertenece');
        }
        const { RouteStatus } = require('../models/route');
        const readOnly = route.statusId === RouteStatus.FINISHED || route.statusId === RouteStatus.CANCELLED;
        res.render('delivery/route', { route, readOnly });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.post('/route/:id/stop/:stopId/complete', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    await RouteStop.update(
        { completed: true, completedAt: new Date() },
        { where: { id: req.params.stopId, routeId: req.params.id } }
    );
    res.json({ ok: true });
});

// Llegue al stop (geo-mark, no cambia estado del envio)
router.post('/route/:id/stop/:stopId/arrive', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const gate = checkStopOrder(route, req.params.stopId);
    if (!gate.ok) { return res.status(409).json({ error: gate.error, blockingStop: gate.blockingStop }); }
    const stop = gate.target;
    // No cambia statusId del shipment, solo registra visita en history como STATUS_CHANGE
    if (stop.shipmentId) {
        const shipmentHistoryModel = require('../models/shipmentHistory');
        await shipmentHistoryModel.create({
            shipmentId: stop.shipmentId,
            fromStatusId: null,
            toStatusId: stop.shipment?.statusId || Status.IN_TRANSIT.id,
            comment: 'El repartidor llegó al domicilio.',
            userId: res.locals.currentUser.id,
            eventType: 'ARRIVED',
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
        });
    }
    res.json({ ok: true });
});

// Pickup confirmado: transita IN_PREPARATION -> IN_TRANSIT para todos los envios del pickup
router.post('/route/:id/stop/:stopId/pickup-confirmed', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const gateP = checkStopOrder(route, req.params.stopId);
    if (!gateP.ok) { return res.status(409).json({ error: gateP.error, blockingStop: gateP.blockingStop }); }
    // Pickup stop puede no tener shipmentId; tomar todos los shipments del route con status IN_PREPARATION o ASSIGNED
    const stops = route.stops || [];
    const shipmentIds = stops
        .filter(s => s.stopType === 'delivery' && s.shipmentId)
        .map(s => s.shipmentId);
    let ok = 0, failed = 0;
    for (const sid of shipmentIds) {
        try {
            // ASSIGNED -> IN_PREPARATION -> IN_TRANSIT en cadena
            const shipment = await shipmentModel.getById(sid);
            if (!shipment) { failed++; continue; }
            if (shipment.statusId === Status.ASSIGNED.id) {
                await stateMachine.transition({
                    shipmentId: sid, toStatusId: Status.IN_PREPARATION.id, actor: res.locals.currentUser, branchId: route.originBranchId,
                });
            }
            await stateMachine.transition({
                shipmentId: sid, toStatusId: Status.IN_TRANSIT.id, actor: res.locals.currentUser, branchId: route.originBranchId,
            });
            ok++;
        } catch (e) {
            console.error('pickup-confirmed err', sid, e.message);
            failed++;
        }
    }
    await RouteStop.update(
        { completed: true, completedAt: new Date() },
        { where: { id: req.params.stopId, routeId: req.params.id } }
    );
    res.json({ ok: true, transitioned: ok, failed });
});

// Marcar entregado rapido (sin formulario de evidencia completa)
router.post('/route/:id/stop/:stopId/delivered', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const gateD = checkStopOrder(route, req.params.stopId);
    if (!gateD.ok) { return res.status(409).json({ error: gateD.error, blockingStop: gateD.blockingStop }); }
    const stop = gateD.target;
    if (!stop || !stop.shipmentId) { return res.status(404).json({ error: 'Stop no es entrega' }); }
    try {
        await stateMachine.transition({
            shipmentId: stop.shipmentId,
            toStatusId: Status.DELIVERED.id,
            actor: res.locals.currentUser,
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
        });
        await RouteStop.update({ completed: true, completedAt: new Date() }, { where: { id: stop.id } });
        res.json({ ok: true });
    } catch (e) {
        res.status(422).json({ error: e.message });
    }
});

// Marcar intento fallido (con motivo codificado, vecino opcional y retry mismo día)
router.post('/route/:id/stop/:stopId/failed', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const gateF = checkStopOrder(route, req.params.stopId);
    if (!gateF.ok) { return res.status(409).json({ error: gateF.error, blockingStop: gateF.blockingStop }); }
    const stop = gateF.target;
    if (!stop || !stop.shipmentId) { return res.status(404).json({ error: 'Stop no es entrega' }); }

    const {
        reasonCode, reasonText, comment, latitude, longitude,
        neighborName, neighborPhone, neighborRelation,
        retrySameDay,
    } = req.body;

    const reason = (reasonText || reasonCode || comment || '').trim();
    if (!reason) { return res.status(400).json({ error: 'Motivo obligatorio' }); }

    const failedAttemptModel = require('../models/failedAttempt');
    const { getSuggestedDate } = require('../utils/failedAttempt');

    try {
        await failedAttemptModel.create({
            shipmentId:       stop.shipmentId,
            reason,
            reasonCode:       reasonCode  || null,
            observation:      comment     || null,
            latitude:         latitude    || null,
            longitude:        longitude   || null,
            neighborName:     neighborName     || null,
            neighborPhone:    neighborPhone    || null,
            neighborRelation: neighborRelation || null,
            retrySameDay:     !!retrySameDay,
            suggestedDate:    getSuggestedDate(reason),
            status:           retrySameDay ? 'reintento_mismo_dia' : 'pendiente',
        });
        // Verificar si superó el máximo de intentos fallidos
        const settingModel = require('../models/setting');
        const settings = await settingModel.getAll();
        const maxIntentos = parseInt(settings.max_intentos_fallidos) || 3;
        const intentosPrevios = await failedAttemptModel.getByShipmentId(stop.shipmentId);
        if (intentosPrevios.length >= maxIntentos) {
            const shipmentHistoryModel = require('../models/shipmentHistory');
            const { Shipment } = require('../models/shipment');
            await Shipment.update({ statusId: 5 }, { where: { id: stop.shipmentId } });
            await shipmentHistoryModel.create({
                shipmentId:   stop.shipmentId,
                fromStatusId: Status.FAILED_ATTEMPT.id,
                toStatusId:   5,
                comment:      `Envío cancelado automáticamente por superar ${maxIntentos} intentos fallidos`,
                userId:       res.locals.currentUser?.id || null,
                eventType:    'STATUS_CHANGE',
            });
        }
        if (retrySameDay) {
            // No transito de estado: shipment sigue IN_TRANSIT. El stop se marca como saltado
            // para revisitar al final. Se loguea evento en history.
            await RouteStop.update(
                { skipped: true, skipReason: `Retry mismo día: ${reason}`, skippedAt: new Date() },
                { where: { id: stop.id, routeId: route.id } }
            );
            const shipmentHistoryModel = require('../models/shipmentHistory');
            await shipmentHistoryModel.create({
                shipmentId: stop.shipmentId,
                fromStatusId: stop.shipment?.statusId || Status.IN_TRANSIT.id,
                toStatusId:   stop.shipment?.statusId || Status.IN_TRANSIT.id,
                comment:      `Reintento programado para hoy: ${reason}`,
                userId:       res.locals.currentUser.id,
                eventType:    'RETRY_SAME_DAY',
                latitude:     latitude  || null,
                longitude:    longitude || null,
            });
            return res.json({ ok: true, retrySameDay: true });
        }

        await stateMachine.transition({
            shipmentId: stop.shipmentId,
            toStatusId: Status.FAILED_ATTEMPT.id,
            actor: res.locals.currentUser,
            comment: reason,
            latitude: latitude  || null,
            longitude: longitude || null,
        });
        await RouteStop.update(
            { completed: true, completedAt: new Date() },
            { where: { id: stop.id, routeId: route.id } }
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(422).json({ error: e.message });
    }
});

// === Saltar parada (volver más tarde) ===
router.post('/route/:id/stop/:stopId/skip', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const reason = (req.body.reason || '').trim() || 'Saltada por el repartidor';
    await RouteStop.update(
        { skipped: true, skipReason: reason, skippedAt: new Date() },
        { where: { id: req.params.stopId, routeId: req.params.id } }
    );
    res.json({ ok: true });
});

// === Reanudar parada saltada (vuelve a quedar pendiente) ===
router.post('/route/:id/stop/:stopId/unskip', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    await RouteStop.update(
        { skipped: false, skipReason: null, skippedAt: null },
        { where: { id: req.params.stopId, routeId: req.params.id } }
    );
    res.json({ ok: true });
});

// === Iniciar ruta (marca started_at, status IN_ROUTE) ===
router.post('/route/:id/start', requireDelivery, async (req, res) => {
    const { Route, RouteStatus } = require('../models/route');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    if (route.startedAt) {return res.json({ ok: true, alreadyStarted: true });}
    await Route.update(
        { startedAt: new Date(), statusId: RouteStatus.IN_ROUTE },
        { where: { id: req.params.id } }
    );
    res.json({ ok: true });
});

// === Finalizar ruta ===
router.post('/route/:id/finish', requireDelivery, async (req, res) => {
    const { Route, RouteStatus } = require('../models/route');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    await Route.update(
        { finishedAt: new Date(), statusId: RouteStatus.FINISHED },
        { where: { id: req.params.id } }
    );
    res.json({ ok: true });
});

// === Pausar ruta (almuerzo, recarga combustible) ===
router.post('/route/:id/pause', requireDelivery, async (req, res) => {
    const { RoutePause } = require('../models/routePause');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const open = await RoutePause.findOne({ where: { routeId: route.id, endedAt: null } });
    if (open) {return res.status(409).json({ error: 'Ya hay una pausa activa', pauseId: open.id });}
    const reason = (req.body.reason || '').trim() || 'pausa';
    const pause = await RoutePause.create({ routeId: route.id, userId: res.locals.currentUser.id, reason });
    res.json({ ok: true, pauseId: pause.id, startedAt: pause.startedAt });
});

// === Reanudar ruta (idempotente: cierra cualquier pausa abierta) ===
router.post('/route/:id/resume', requireDelivery, async (req, res) => {
    const { Route } = require('../models/route');
    const { RoutePause } = require('../models/routePause');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    // Cierra cualquier pausa abierta de esta ruta. Si no hay ninguna, no es error.
    const opens = await RoutePause.findAll({ where: { routeId: route.id, endedAt: null } });
    if (opens.length === 0) {
        return res.json({ ok: true, addedSeconds: 0, alreadyClosed: true });
    }
    const endedAt = new Date();
    let totalAdded = 0;
    for (const open of opens) {
        const startedAt = open.startedAt ? new Date(open.startedAt) : endedAt;
        const elapsed = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
        await RoutePause.update({ endedAt }, { where: { id: open.id } });
        totalAdded += elapsed;
    }
    await Route.update(
        { totalPauseSeconds: Number(route.totalPauseSeconds || 0) + totalAdded },
        { where: { id: route.id } }
    );
    res.json({ ok: true, addedSeconds: totalAdded, closed: opens.length });
});

// === Reportar incidente vehicular / accidente ===
router.post('/route/:id/incident', requireDelivery, async (req, res) => {
    const { RouteIncident } = require('../models/routeIncident');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const { incidentType, severity, description, latitude, longitude } = req.body;
    if (!incidentType) {return res.status(400).json({ error: 'Tipo de incidente obligatorio' });}
    const inc = await RouteIncident.create({
        routeId: route.id,
        userId:  res.locals.currentUser.id,
        incidentType,
        severity:    severity    || 'media',
        description: description || null,
        latitude:    latitude    || null,
        longitude:   longitude   || null,
    });
    res.json({ ok: true, incidentId: inc.id });
});

// === Botón de pánico (puede no pertenecer a una ruta) ===
router.post('/panic', requireDelivery, async (req, res) => {
    const { PanicEvent } = require('../models/panicEvent');
    const { latitude, longitude, message, routeId } = req.body;
    const ev = await PanicEvent.create({
        userId:    res.locals.currentUser.id,
        routeId:   routeId  || null,
        latitude:  latitude || null,
        longitude: longitude || null,
        message:   message  || null,
    });
    res.json({ ok: true, panicId: ev.id });
});

// === Resumen post-ruta (vista HTML) ===
router.get('/route/:id/summary', requireDelivery, async (req, res) => {
    try {
        const route = await routeModel.getById(req.params.id);
        if (!route) {return res.status(404).send('Ruta no encontrada');}
        if (route.transport?.driverUserId !== res.locals.currentUser.id) {
            return res.status(403).send('Esta ruta no te pertenece');
        }
        const stops = route.stops || [];
        const delivered = stops.filter(s => s.stopType === 'delivery' && s.completed && s.shipment?.statusId === Status.DELIVERED.id);
        const failed    = stops.filter(s => s.stopType === 'delivery' && s.completed && s.shipment?.statusId === Status.FAILED_ATTEMPT.id);
        const skipped   = stops.filter(s => s.skipped && !s.completed);

        const km = Number(route.totalDistanceKm || 0);
        const startedAt  = route.startedAt  ? new Date(route.startedAt)  : null;
        const finishedAt = route.finishedAt ? new Date(route.finishedAt) : null;
        const grossSec = startedAt && finishedAt ? Math.floor((finishedAt - startedAt) / 1000) : 0;
        const pauseSec = Number(route.totalPauseSeconds || 0);
        const effectiveSec = Math.max(0, grossSec - pauseSec);

        const fuelL    = (Number(route.fuelLPer100Km || 10) / 100) * km;
        const fuelCost = fuelL * Number(route.fuelPricePerL || 1200);

        const commissionPer = Number(route.transport?.commissionPerDelivery || 0);
        const commission = delivered.length * commissionPer;

        res.render('delivery/summary', {
            route, stops,
            deliveredCount: delivered.length,
            failedCount:    failed.length,
            skippedCount:   skipped.length,
            failedStops:    failed,
            km,
            grossSec, pauseSec, effectiveSec,
            fuelL, fuelCost, commission,
        });
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// === Escaneo de devolución a sucursal (no entregados) ===
router.post('/route/:id/return-scan', requireDelivery, async (req, res) => {
    const { ReturnToBranchScan } = require('../models/returnToBranchScan');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const trackingId = (req.body.trackingId || '').trim();
    if (!trackingId) {return res.status(400).json({ error: 'Tracking obligatorio' });}

    const shipment = await shipmentModel.getByTrackingId(trackingId);
    if (!shipment) {return res.status(404).json({ error: 'Envío no encontrado' });}

    // Verifica que el envío pertenezca a esta ruta
    const isInRoute = (route.stops || []).some(s => s.shipmentId === shipment.id);
    if (!isInRoute) {return res.status(422).json({ error: 'Envío no pertenece a esta ruta' });}

    try {
        await ReturnToBranchScan.create({
            shipmentId: shipment.id,
            branchId:   route.originBranchId,
            userId:     res.locals.currentUser.id,
            routeId:    route.id,
        });
    } catch (e) {
        if (!/unique/i.test(e.message || '')) {throw e;}
    }

    // Transición a EN_SUCURSAL si todavía está FAILED_ATTEMPT
    if (shipment.statusId === Status.FAILED_ATTEMPT.id) {
        try {
            await stateMachine.transition({
                shipmentId: shipment.id,
                toStatusId: Status.AT_BRANCH.id,
                actor:      res.locals.currentUser,
                branchId:   route.originBranchId,
                comment:    'Devuelto a sucursal (escaneo post-ruta)',
            });
        } catch { /* ignora si la transición no aplica */ }
    }
    res.json({ ok: true });
});

// GPS heartbeat: graba posicion del repartidor activo
router.post('/heartbeat', requireDelivery, async (req, res) => {
    const sequelize = require('../database/connection');
    const { latitude, longitude, routeId, speedKmh } = req.body;
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
        return res.status(400).json({ error: 'Coords invalidas' });
    }
    await sequelize.query(
        `INSERT INTO logitrack.driver_position (user_id, route_id, latitude, longitude, speed_kmh) VALUES (:uid, :rid, :lat, :lng, :sp)`,
        { replacements: { uid: res.locals.currentUser.id, rid: routeId || null, lat: Number(latitude), lng: Number(longitude), sp: speedKmh || null } }
    );
    res.json({ ok: true });
});

// Latest position por route (publico para tracking via portal)
router.get('/position/route/:routeId', async (req, res) => {
    const sequelize = require('../database/connection');
    const { QueryTypes } = require('sequelize');
    const rows = await sequelize.query(
        `SELECT dp.latitude::float lat, dp.longitude::float lng, dp.speed_kmh::float speed, dp.recorded_at AS at
           FROM logitrack.driver_position dp
           JOIN logitrack.route r ON r."transportId" IN (SELECT id FROM logitrack.transport WHERE driver_user_id=dp.user_id)
          WHERE r.id=:rid
          ORDER BY dp.recorded_at DESC LIMIT 1`,
        { replacements: { rid: Number(req.params.routeId) }, type: QueryTypes.SELECT }
    );
    res.json(rows[0] || null);
});

// Reprogramar fallidos: marca como en sucursal el dia siguiente para nuevo ruteo
router.post('/reschedule-failed', requireDelivery, async (req, res) => {
    const { Shipment } = require('../models/shipment');
    const shipmentHistoryModel = require('../models/shipmentHistory');
    const sequelize = require('../database/connection');
    const failed = await Shipment.findAll({
        where: { statusId: Status.FAILED_ATTEMPT.id, deliveryUserId: res.locals.currentUser.id },
        attributes: ['id', 'currentBranchId'],
    }).catch(() => []);
    let rescheduled = 0;
    await sequelize.transaction(async (t) => {
        for (const s of failed) {
            await Shipment.update(
                { statusId: Status.AT_BRANCH.id, deliveryUserId: null },
                { where: { id: s.id }, transaction: t }
            );
            await shipmentHistoryModel.create({
                shipmentId: s.id,
                fromStatusId: Status.FAILED_ATTEMPT.id,
                toStatusId: Status.AT_BRANCH.id,
                comment: 'Tu envío fue reprogramado para otra fecha de entrega.',
                userId: res.locals.currentUser.id,
                eventType: 'RESCHEDULED',
                branchId: s.currentBranchId,
                transaction: t,
            });
            rescheduled++;
        }
    });
    res.json({ ok: true, rescheduled });
});

module.exports = router;