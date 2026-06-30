const express = require('express');
const router = express.Router();
const { Op, QueryTypes } = require('sequelize');
const { requireAuth, requireDelivery } = require('../middlewares/auth');
const shipmentModel = require('../models/shipment');
const deliveryController = require('../controllers/delivery');
const routeModel = require('../models/route');
const { Route, RouteStatus } = require('../models/route');
const { RouteStop } = require('../models/routeStop');
const { RoutePause } = require('../models/routePause');
const stateMachine = require('../services/shipmentStateMachine');
const { Status } = require('../constants/enums');
const { deliveryValidation, handleCreateValidationErrors } = require('../middlewares/delivery');
const sequelize = require('../database/connection');

// Mientras haya una pausa activa, el repartidor no puede ejecutar acciones operativas
// (pickup, entregado, fallido, skip, etc). Reanudar la ruta es el único paso permitido.
function getActivePause(routeId) {
    return RoutePause.findOne({ where: { routeId, endedAt: null } });
}
async function ensureNotPaused(routeId) {
    const pause = await getActivePause(routeId);
    if (pause) {
        return { ok: false, error: 'La ruta está pausada. Reanudala antes de continuar.', pauseId: pause.id };
    }
    return { ok: true };
}

// Crea (o reutiliza) una incidencia tipo PACKAGE_BROKEN para un envío.
// Reutiliza si ya hay una incidencia OPEN/IN_REVIEW del mismo tipo para evitar duplicados.
async function createDamageIncident({ shipmentId, description, userId }) {
    const incidentTypeModel = require('../models/incidentType');
    const { Incident } = require('../models/incident');
    const incidentHistoryModel = require('../models/incidentHistory');
    const { IncidentStatus, IncidentChannel, IncidentEventType } = require('../constants/enums');

    const type = await incidentTypeModel.IncidentType.findOne({ where: { code: 'PACKAGE_BROKEN', active: true } });
    if (!type) { throw new Error('Tipo de incidencia PACKAGE_BROKEN no configurado'); }

    const existing = await Incident.findOne({
        where: {
            shipmentId,
            incidentTypeId: type.id,
            status: { [Op.in]: [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW] },
        },
    });
    if (existing) { return existing; }

    return sequelize.transaction(async (t) => {
        const inc = await Incident.create({
            shipmentId,
            incidentTypeId: type.id,
            status:         IncidentStatus.OPEN,
            priority:       3, // Alta: paquete dañado merece atención prioritaria
            escalated:      false,
            description:    description.slice(0, 2000),
            openedChannel:  IncidentChannel.INTERNAL,
            openedByUserId: userId,
        }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId:  inc.id,
            eventType:   IncidentEventType.CREATED,
            toValue:     IncidentStatus.OPEN,
            comment:     'Incidencia creada automáticamente desde intento fallido (motivo: paquete dañado).',
            userId,
            transaction: t,
        });
        return inc;
    });
}

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

// ── Offline ([prototype]) ────────────────────────────────────────────────
// Idempotencia + "gana el servidor" para las acciones que el repartidor encoló
// sin conexión. Se activa SOLO cuando el cliente manda el header Idempotency-Key
// (es decir, al re-sincronizar la cola); el flujo online normal no se ve afectado.
async function recordOfflineAction(req, res, statusCode, body, conflict) {
    try {
        const ridMatch = (req.path.match(/\/route\/(\d+)/) || [])[1];
        const rid = ridMatch || (req.body && req.body.routeId) || null;
        await sequelize.query(
            `INSERT INTO logitrack.offline_action
                ("idempotencyKey","userId","routeId","method","path","statusCode","responseBody","conflict","queuedAt","syncedAt")
             VALUES (:k,:uid,:rid,:method,:path,:code,:body,:conflict,:queuedAt,now())
             ON CONFLICT ("idempotencyKey") DO NOTHING`,
            { replacements: {
                k:        req.get('Idempotency-Key'),
                uid:      res.locals.currentUser ? res.locals.currentUser.id : null,
                rid:      rid ? Number(rid) : null,
                method:   req.method,
                path:     String(req.originalUrl).slice(0, 255),
                code:     statusCode,
                body:     body ? JSON.stringify(body).slice(0, 4000) : null,
                conflict: !!conflict,
                queuedAt: req.get('X-Queued-At') ? new Date(Number(req.get('X-Queued-At'))) : null,
            } }
        );
    } catch (e) { console.error('recordOfflineAction:', e.message); }
}

async function offlineIdempotency(req, res, next) {
    if (req.method !== 'POST') { return next(); }
    const key = req.get('Idempotency-Key');
    if (!key) { return next(); }
    try {
        const rows = await sequelize.query(
            'SELECT "statusCode","responseBody" FROM logitrack.offline_action WHERE "idempotencyKey"=:k',
            { replacements: { k: key }, type: QueryTypes.SELECT }
        );
        if (rows.length) {
            // Ya aplicada: respondemos sin volver a ejecutar el handler (dedupe del reintento).
            const code = rows[0].statusCode || 200;
            return res.status(code).json({ ok: code < 400, deduped: true });
        }
        // Gana el servidor: si la ruta ya está cerrada/cancelada/interrumpida, rechazamos.
        const m = req.path.match(/^\/route\/(\d+)\//);
        if (m) {
            const route = await Route.findByPk(Number(m[1]), { attributes: ['statusId'] }).catch(() => null);
            if (route && [RouteStatus.FINISHED, RouteStatus.CANCELLED, RouteStatus.INTERRUPTED].includes(route.statusId)) {
                const body = { ok: false, conflict: true, error: 'La ruta fue cerrada o reasignada mientras estabas sin conexión; esta acción no se aplicó.' };
                await recordOfflineAction(req, res, 409, body, true);
                return res.status(409).json(body);
            }
        }
        // Registra la acción al terminar la respuesta (cubre json, redirect y send) para
        // deduplicar reintentos futuros con la misma clave.
        res.on('finish', () => { recordOfflineAction(req, res, res.statusCode || 200, null, false); });
        return next();
    } catch (e) {
        console.error('offlineIdempotency:', e.message);
        return next();
    }
}
router.use(offlineIdempotency);

// Bundle del ruteo activo para operar offline. Solo la ruta IN_ROUTE del propio
// repartidor, con los datos mínimos necesarios (se cachean CIFRADOS en el dispositivo).
router.get('/route/:id/offline-bundle', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    if (route.statusId !== RouteStatus.IN_ROUTE) {
        return res.status(409).json({ error: 'La ruta no está en tránsito', code: 'NOT_ACTIVE' });
    }
    const stops = (route.stops || []).map((s) => ({
        id: s.id, sequence: s.sequence, stopType: s.stopType,
        completed: s.completed, skipped: s.skipped,
        lat: s.lat, lng: s.lng,
        distanceFromPrevKm: s.distanceFromPrevKm, estimatedMinutes: s.estimatedMinutes,
        branch: s.branch ? { name: s.branch.name, address: s.branch.address } : null,
        shipment: s.shipment ? {
            id: s.shipment.id, trackingId: s.shipment.trackingId, statusId: s.shipment.statusId,
            deliverySecretCode: s.shipment.deliverySecretCode || null,
            codAmount: s.shipment.codAmount, codMethod: s.shipment.codMethod,
            fragile: s.shipment.fragile, refrigerated: s.shipment.refrigerated, oversized: s.shipment.oversized,
            weightKg: s.shipment.weightKg, packageQty: s.shipment.packageQty,
            specialInstructions: s.shipment.specialInstructions,
            expectedDeliveryFrom: s.shipment.expectedDeliveryFrom, expectedDeliveryTo: s.shipment.expectedDeliveryTo,
            recipient: s.shipment.recipient ? { fullName: s.shipment.recipient.fullName, phone: s.shipment.recipient.phone } : null,
            address: s.shipment.address ? { street: s.shipment.address.street, number: s.shipment.address.number } : null,
        } : null,
    }));
    res.json({
        routeId: route.id, statusId: route.statusId,
        totalDistanceKm: route.totalDistanceKm,
        transportName: route.transport ? route.transport.name : '',
        originBranch: route.originBranch ? route.originBranch.name : '',
        cachedAt: new Date().toISOString(),
        stops,
    });
});

router.get('/', requireDelivery, async (req, res) => {
    try {
        const userId = res.locals.currentUser.id;
        const { RouteStatus } = require('../models/route');
        const [shipments, routes, driverFatigueRow] = await Promise.all([
            shipmentModel.search({ deliveryUserId: userId }),
            routeModel.getAllByDriver(userId),
            require('../services/fatigue').getDriverStatus(userId).catch(() => null),
        ]);

        // LGT-195: si el transportista quedó INHABILITADO (rechazó el consentimiento de
        // fatiga las veces parametrizadas), el card de ruta se muestra en rojo, sin
        // accionable, y al clickear dispara el popup explicativo.
        const driverDisabled = (driverFatigueRow && driverFatigueRow.status === 'DISABLED')
            ? {
                reason:     driverFatigueRow.reason || null,
                disabledAt: driverFatigueRow.disabledAt || null,
              }
            : null;

        // "Activa" = IN_ROUTE (en curso) o, si no hay, la PLANNED más reciente
        const inRoute = routes.find(r => r.statusId === RouteStatus.IN_ROUTE);
        const planned = routes.filter(r => r.statusId === RouteStatus.PLANNED);
        const finished = routes.filter(r => r.statusId === RouteStatus.FINISHED || r.statusId === RouteStatus.CANCELLED);

        const activeRoute = inRoute || planned[0] || null;
        const upcomingRoutes = planned.filter(r => !activeRoute || r.id !== activeRoute.id);

        // LGT-193/199: ruta bloqueada o pausada por fatiga → aviso al repartidor.
        const fatigueRoute = routes.find(r =>
            r.statusId === RouteStatus.BLOCKED_FATIGUE || r.statusId === RouteStatus.PAUSED_FATIGUE) || null;
        let fatigueBlocked = fatigueRoute
            ? { id: fatigueRoute.id, paused: fatigueRoute.statusId === RouteStatus.PAUSED_FATIGUE }
            : null;
        // Bloqueo en el control de INICIO (la ruta no cambia de estado): banner por redirect.
        if (!fatigueBlocked && req.query.fatiga === 'bloqueado') {
            fatigueBlocked = { id: Number(req.query.ruta) || null, paused: false, gate: true };
        }

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
            fatigueBlocked,
            driverDisabled,
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
        // Limpieza defensiva del banner "Ruta en pausa" fantasma:
        //   1) cerramos pausas huérfanas (>30 min sin reanudar) — almuerzos olvidados
        //   2) si la ruta no está IN_ROUTE, cualquier pause abierta es inconsistente → cerrar
        const routeIdNum = Number(req.params.id);
        if (Number.isInteger(routeIdNum) && routeIdNum > 0) {
            // Necesitamos saber el estado de la ruta para decidir el barrido total.
            const peek = await Route.findByPk(routeIdNum, { attributes: ['statusId'] }).catch(() => null);
            const isInRoute = peek && peek.statusId === RouteStatus.IN_ROUTE;
            const where = { routeId: routeIdNum, endedAt: null };
            if (isInRoute) {
                where.startedAt = { [Op.lt]: new Date(Date.now() - 30 * 60 * 1000) };
            }
            await RoutePause.update({ endedAt: new Date() }, { where })
                .catch(err => console.error('stale-pause cleanup err:', err.message));
        }

        // LGT-195: transportista INHABILITADO no puede entrar a ninguna ruta, ni por URL directa.
        if (await fatigueSvc.isDriverDisabled(res.locals.currentUser.id)) {
            return res.redirect('/delivery?inhabilitado=1');
        }

        const route = await routeModel.getById(req.params.id);
        if (!route) { return res.status(404).send('Ruta no encontrada'); }
        if (route.transport?.driverUserId !== res.locals.currentUser.id) {
            return res.status(403).send('Esta ruta no te pertenece');
        }
        // LGT-193/199: ruta bloqueada/pausada por fatiga → no se puede operar.
        // Redirige al inicio, donde se muestra el aviso para consultar al supervisor.
        if (route.statusId === RouteStatus.BLOCKED_FATIGUE || route.statusId === RouteStatus.PAUSED_FATIGUE) {
            return res.redirect('/delivery?fatigue=1');
        }
        const readOnly = route.statusId === RouteStatus.FINISHED || route.statusId === RouteStatus.CANCELLED;
        // Para el POD offline en la misma página: saber si el envío exige código clave.
        const settingModel = require('../models/setting');
        const dsSetting = await settingModel.getAll().catch(() => ({}));
        const deliverySecretEnabled = dsSetting.delivery_secret_enabled !== 'false';
        // Catálogo de motivos de entrega fallida para el copiloto de voz (labels configurables).
        // Se inyecta como window.LT_FAILED_REASONS; el copiloto encasilla por estos códigos.
        const failedReasons = await require('../models/failedAttemptReason').getActive()
            .then(rows => rows.map(r => ({ code: r.code, label: r.label })))
            .catch(() => []);
        res.render('delivery/route', { route, readOnly, deliverySecretEnabled, failedReasons });
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
    const pauseCheck = await ensureNotPaused(route.id);
    if (!pauseCheck.ok) { return res.status(409).json(pauseCheck); }
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
            eventType: 'ARRIVED_DESTINATION',
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
        });
        // Sprint 3 - 2.3 notif SHIPMENT_ARRIVED_DESTINATION
        const { NotificationEvent: NE3 } = require('../constants/enums');
        require('../controllers/shipment').notifyShipmentEvent(NE3.SHIPMENT_ARRIVED_DESTINATION, stop.shipmentId)
            .catch(e => console.error('notif ARRIVED_DESTINATION', stop.shipmentId, e.message));
    }
    res.json({ ok: true });
});

// Pickup confirmado: transita IN_PREPARATION -> IN_TRANSIT para todos los envios del pickup.
// Atomicidad: si algún shipment falla la transición, abortamos toda la confirmación
// para no quedar con estado inconsistente (algunos IN_TRANSIT y otros no).
router.post('/route/:id/stop/:stopId/pickup-confirmed', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const pauseCheck = await ensureNotPaused(route.id);
    if (!pauseCheck.ok) { return res.status(409).json(pauseCheck); }
    const gateP = checkStopOrder(route, req.params.stopId);
    if (!gateP.ok) { return res.status(409).json({ error: gateP.error, blockingStop: gateP.blockingStop }); }
    const stops = route.stops || [];
    const shipmentIds = stops
        .filter(s => s.stopType === 'delivery' && s.shipmentId)
        .map(s => s.shipmentId);

    try {
        // El repartidor sólo tiene permitido ASSIGNED→IN_TRANSIT o IN_PREPARATION→IN_TRANSIT
        // (la stateMachine rechaza ASSIGNED→IN_PREPARATION para rol DELIVERY).
        // Por eso transitamos directo al destino final IN_TRANSIT sin pasar por IN_PREPARATION.
        // Si una transición falla, abortamos sin marcar el stop — el repartidor reintenta.
        let ok = 0;
        for (const sid of shipmentIds) {
            const shipment = await shipmentModel.getById(sid);
            if (!shipment) {
                throw new Error(`Envío ${sid} no encontrado`);
            }
            if (shipment.statusId === Status.IN_TRANSIT.id) {
                ok++;
                continue; // ya está en tránsito, no re-transitamos
            }
            await stateMachine.transition({
                shipmentId: sid,
                toStatusId: Status.IN_TRANSIT.id,
                actor:      res.locals.currentUser,
                branchId:   route.originBranchId,
            });
            ok++;
        }
        await RouteStop.update(
            { completed: true, completedAt: new Date() },
            { where: { id: req.params.stopId, routeId: req.params.id } }
        );
        res.json({ ok: true, transitioned: ok });
    } catch (e) {
        console.error('pickup-confirmed err', e.message);
        res.status(422).json({ error: `No se pudo confirmar el pickup: ${e.message}. Revisá los envíos y reintentá.` });
    }
});

// Endpoint legacy de entrega rápida: ELIMINADO.
// La entrega ahora requiere POD obligatorio (foto + firma + receptor) vía /delivery/evidence/:trackingId/pod.
// Responde 410 Gone para clientes viejos.
router.post('/route/:id/stop/:stopId/delivered', requireDelivery, (req, res) => {
    res.status(410).json({
        error: 'La entrega rápida fue removida. Capturá el POD (foto + firma + datos del receptor) en /delivery/evidence/:trackingId/pod.',
        deprecated: true,
    });
});

// Marcar intento fallido (con motivo codificado, vecino opcional y retry mismo día).
// Si el motivo es 'paquete_dañado', crea automáticamente una incidencia tipo PACKAGE_BROKEN.
router.post('/route/:id/stop/:stopId/failed', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const pauseCheck = await ensureNotPaused(route.id);
    if (!pauseCheck.ok) { return res.status(409).json(pauseCheck); }
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

    // Paquete dañado tiene un flujo propio: el remitente decide reembolso o reemplazo,
    // no se le ofrece reentrega (esperar nueva fecha o retirar por sucursal).
    const isDamaged = ['paquete_dañado', 'paquete_danado'].includes(reasonCode)
        || /\bdanad/.test(String(reason).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

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

        // === Paquete dañado: incidencia + email de gestión (reembolso / reemplazo) al
        // remitente, y estado terminal PACKAGE_FAILED. NO se manda el aviso de reentrega.
        if (isDamaged) {
            const { NotificationEvent: NED } = require('../constants/enums');
            try {
                const inc = await createDamageIncident({
                    shipmentId: stop.shipmentId,
                    description: `Paquete dañado reportado en ruta. Motivo: ${reason}.${comment ? ' Detalle: ' + comment : ''}`,
                    userId: res.locals.currentUser?.id || null,
                });
                // Aviso informativo de incidencia + email accionable al remitente (reembolso/reemplazo).
                require('../controllers/shipment').notifyShipmentEvent(NED.SHIPMENT_INCIDENT, stop.shipmentId)
                    .catch(e => console.error('notif INCIDENT', stop.shipmentId, e.message));
                require('../services/incidentDamageResolution').notifySenderIfDamage({
                    incidentId: inc?.id || null,
                    shipment: { id: stop.shipmentId, trackingId: stop.shipment?.trackingId },
                    type: { code: 'PACKAGE_BROKEN' },
                }).catch(e => console.error('notif damage choice', stop.shipmentId, e.message));
            } catch (incErr) {
                console.error('auto-incident dañado err:', incErr.message);
            }
            // Estado PACKAGE_FAILED (emite SHIPMENT_PACKAGE_FAILED, no reentrega).
            await stateMachine.transition({
                shipmentId: stop.shipmentId,
                toStatusId: Status.PACKAGE_FAILED.id,
                actor: res.locals.currentUser,
                comment: reason,
                latitude: latitude  || null,
                longitude: longitude || null,
            });
            await RouteStop.update(
                { completed: true, completedAt: new Date() },
                { where: { id: stop.id, routeId: route.id } }
            );
            return res.json({ ok: true, packageFailed: true });
        }

        // Verificar si superó el máximo de intentos fallidos.
        // Sprint 3 - 2.5: si el motivo configurado tiene maxAttemptsOverride, usar ese.
        // El intento recién creado YA cuenta; se cancela al alcanzar el tope, no después.
        const settingModel = require('../models/setting');
        const settings = await settingModel.getAll();
        let maxIntentos = parseInt(settings.max_intentos_fallidos) || 3;
        try {
            if (reasonCode) {
                const fr = await require('../models/failedAttemptReason').getByCode(reasonCode);
                if (fr && fr.maxAttemptsOverride) { maxIntentos = fr.maxAttemptsOverride; }
            }
        } catch { /* fallback default */ }
        let maxAttemptsReached = false;
        const intentosPrevios = await failedAttemptModel.getByShipmentId(stop.shipmentId);
        if (intentosPrevios.length >= maxIntentos) {
            maxAttemptsReached = true;
            const shipmentHistoryModel = require('../models/shipmentHistory');
            const { Shipment } = require('../models/shipment');
            // Lee estado real antes de cancelar para que el history tenga el fromStatusId correcto.
            const current = await Shipment.findOne({ where: { id: stop.shipmentId }, attributes: ['statusId'] });
            const fromStatusId = current?.statusId || Status.FAILED_ATTEMPT.id;
            await Shipment.update({ statusId: Status.CANCELLED.id }, { where: { id: stop.shipmentId } });
            await shipmentHistoryModel.create({
                shipmentId:   stop.shipmentId,
                fromStatusId,
                toStatusId:   Status.CANCELLED.id,
                comment:      `Envío cancelado automáticamente por superar ${maxIntentos} intentos fallidos`,
                userId:       res.locals.currentUser?.id || null,
                eventType:    'STATUS_CHANGE',
            });
        }

        // Sprint 3 - 2.5: si el motivo fue paquete dañado O el motivo configurable tiene
        // createsIncident=true, crear incidencia automática asociada al envío.
        let shouldCreateIncident = (reasonCode === 'paquete_dañado' || reasonCode === 'paquete_danado');
        try {
            if (!shouldCreateIncident && reasonCode) {
                const fr = await require('../models/failedAttemptReason').getByCode(reasonCode);
                if (fr && fr.createsIncident) { shouldCreateIncident = true; }
            }
        } catch { /* fallback */ }
        if (shouldCreateIncident) {
            try {
                await createDamageIncident({
                    shipmentId: stop.shipmentId,
                    description: `Incidencia automática desde intento fallido. Motivo: ${reason}.${comment ? ' Detalle: ' + comment : ''}`,
                    userId: res.locals.currentUser?.id || null,
                });
                // Sprint 3 - 2.3 notif SHIPMENT_INCIDENT
                const { NotificationEvent: NE2 } = require('../constants/enums');
                require('../controllers/shipment').notifyShipmentEvent(NE2.SHIPMENT_INCIDENT, stop.shipmentId)
                    .catch(e => console.error('notif INCIDENT', stop.shipmentId, e.message));
            } catch (incErr) {
                console.error('auto-incident err:', incErr.message);
            }
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
            // Sprint 3 - 2.3 notif SHIPMENT_RESCHEDULED (reintento mismo día también es reprogramación)
            const { NotificationEvent: NE } = require('../constants/enums');
            const shipmentCtrl = require('../controllers/shipment');
            shipmentCtrl.notifyShipmentEvent(NE.SHIPMENT_RESCHEDULED, stop.shipmentId)
                .catch(e => console.error('notif RESCHEDULED retry', stop.shipmentId, e.message));
            return res.json({ ok: true, retrySameDay: true });
        }

        // Sprint 3 - 2.3 notif SHIPMENT_FAILED_ATTEMPT ya emitida por stateMachine via mapper;
        // mantenemos transition. Si reasonCode → motivo configurable, sumar también notif INCIDENT.
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
        // maxAttemptsReached: el copiloto de voz lo usa para avisar que el envío ya no admite reintentos (CV-05 CA6).
        res.json({ ok: true, maxAttemptsReached });
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
    const pauseCheck = await ensureNotPaused(route.id);
    if (!pauseCheck.ok) { return res.status(409).json(pauseCheck); }
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
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    if (route.startedAt) { return res.json({ ok: true, alreadyStarted: true }); }
    // Sólo se puede iniciar una ruta en estado PLANNED.
    if (route.statusId !== RouteStatus.PLANNED) {
        return res.status(409).json({ error: `No se puede iniciar una ruta en estado ${route.statusId}. Sólo rutas planificadas.` });
    }
    // Ojo de Patrón (LGT-190/193): gate de fatiga antes de salir a reparto.
    // Requiere consentimiento aceptado y prueba apta (o liberación del supervisor).
    try {
        const fatigueCfg = require('../services/fatigue/config');
        const fatigueSvc = require('../services/fatigue');
        const cfg = await fatigueCfg.getConfig(route.originBranchId);
        if (cfg.enabled) {
            // LGT-195: transportista inhabilitado (cross-ruta) no puede iniciar.
            if (await fatigueSvc.isDriverDisabled(res.locals.currentUser.id)) {
                return res.status(409).json({ error: 'Transportista inhabilitado por fatiga', fatigue: { reason: 'DRIVER_DISABLED' } });
            }
            const gate = await fatigueSvc.canStart(route.id);
            if (!gate.ok) {
                return res.status(409).json({ error: 'Control de fatiga requerido', fatigue: gate });
            }
        }
    } catch { /* si el control de fatiga falla, no bloquear el inicio operativo */ }
    // 1 ruta activa por repartidor: si ya hay otra IN_ROUTE de este driver, bloquear.
    const { Transport } = require('../models/transport');
    const driverTransports = await Transport.findAll({
        where: { driverUserId: res.locals.currentUser.id },
        attributes: ['id'],
    });
    const driverTxIds = driverTransports.map(t => t.id);
    if (driverTxIds.length > 0) {
        const otherActive = await Route.findOne({
            where: {
                transportId: { [Op.in]: driverTxIds },
                statusId:    RouteStatus.IN_ROUTE,
                id:          { [Op.ne]: route.id },
            },
            attributes: ['id'],
        });
        if (otherActive) {
            return res.status(409).json({ error: `Ya tenés otra ruta en curso (#${otherActive.id}). Finalizala antes de iniciar esta.` });
        }
    }
    const routeStartedAt = new Date();
    await Route.update(
        { startedAt: routeStartedAt, statusId: RouteStatus.IN_ROUTE },
        { where: { id: req.params.id } }
    );
    // Ojo de Patrón: ancla el conteo de manejo al inicio real de la ruta. Así el tiempo
    // cuenta desde que arranca (no desde que se abre el widget), persiste al navegar y
    // solo se congela cuando el conductor marca "Estoy detenido".
    try {
        await fatigueRecheck.startDriving(req.params.id, routeStartedAt);
    } catch (e) { console.warn('[fatigue] startDriving:', e.message); }
    // Sprint 3 - 2.1 / 2.3: por cada envío en la ruta emitir evento OUT_FOR_DELIVERY
    // en el timeline y disparar notificación SHIPMENT_OUT_FOR_DELIVERY.
    try {
        const shipmentHistoryModel = require('../models/shipmentHistory');
        const { NotificationEvent, ShipmentHistoryEvent } = require('../constants/enums');
        const shipmentCtrl = require('../controllers/shipment');
        for (const stop of (route.stops || []).filter(s => s.stopType === 'delivery' && s.shipmentId)) {
            await shipmentHistoryModel.create({
                shipmentId:   stop.shipmentId,
                fromStatusId: stop.shipment?.statusId || Status.IN_TRANSIT.id,
                toStatusId:   stop.shipment?.statusId || Status.IN_TRANSIT.id,
                comment:      `Salida a reparto — Ruta #${route.id}`,
                userId:       res.locals.currentUser.id,
                eventType:    ShipmentHistoryEvent.OUT_FOR_DELIVERY,
            });
            shipmentCtrl.notifyShipmentEvent(NotificationEvent.SHIPMENT_OUT_FOR_DELIVERY, stop.shipmentId)
                .catch(e => console.error('notif OUT_FOR_DELIVERY', stop.shipmentId, e.message));
        }
    } catch (e) {
        console.error('start route history/notify err:', e.message);
    }
    res.json({ ok: true });
});

// === Finalizar ruta ===
// Resolución de stops skipped pendientes: se transicionan a FAILED_ATTEMPT (no atendidos)
// y se devuelven al repartidor como envíos a reprogramar. Stops delivery pendientes (no
// skipped y no completed) bloquean la finalización — el repartidor debe entregarlos o
// marcarlos como fallidos.
router.post('/route/:id/finish', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    if (route.statusId === RouteStatus.FINISHED || route.statusId === RouteStatus.CANCELLED) {
        return res.status(409).json({ error: 'La ruta ya está cerrada.' });
    }

    const stops = route.stops || [];
    const unresolved = stops.filter(s => !s.completed && !s.skipped);
    if (unresolved.length > 0) {
        return res.status(409).json({
            error: `Hay ${unresolved.length} parada(s) sin resolver. Confirmá la entrega o marcalas como fallido antes de finalizar.`,
            unresolvedStopIds: unresolved.map(s => s.id),
        });
    }

    const skippedDeliveries = stops.filter(s => s.skipped && !s.completed && s.stopType === 'delivery' && s.shipmentId);
    const failedAttemptModel = require('../models/failedAttempt');
    const { getSuggestedDate } = require('../utils/failedAttempt');
    let autoFailed = 0;
    for (const s of skippedDeliveries) {
        try {
            const reason = `No atendido en ruta${s.skipReason ? ': ' + s.skipReason : ''}`;
            await failedAttemptModel.create({
                shipmentId:    s.shipmentId,
                reason,
                reasonCode:    'no_atendido_en_ruta',
                observation:   s.skipReason || null,
                suggestedDate: getSuggestedDate(reason),
                status:        'pendiente',
            });
            await stateMachine.transition({
                shipmentId: s.shipmentId,
                toStatusId: Status.FAILED_ATTEMPT.id,
                actor:      res.locals.currentUser,
                comment:    reason,
            });
            await RouteStop.update(
                { completed: true, completedAt: new Date() },
                { where: { id: s.id, routeId: route.id } }
            );
            autoFailed++;
        } catch (e) {
            console.error('finish auto-failed err', s.id, e.message);
        }
    }

    await Route.update(
        { finishedAt: new Date(), statusId: RouteStatus.FINISHED },
        { where: { id: req.params.id } }
    );
    res.json({ ok: true, autoFailedSkipped: autoFailed });
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

// === Reportar incidente EN RUTA (vehicular / accidente / zona insegura) ===
// Distinto del módulo de Incidencias (Incident) del envío/cliente: esto es del repartidor/ruta.
// TODO (a definir con el equipo): hoy RouteIncident es write-only — se guarda pero NO se notifica
// a nadie ni se muestra en un panel. Falta: (1) notificar al supervisor de la sucursal (reusar el
// sistema de notificaciones de fatiga/incidencias) y (2) una vista para verlos/resolverlos.
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

// ===================== Ojo de Patrón — control de fatiga =====================
const fatigueSvc = require('../services/fatigue');
const fatigueCfg = require('../services/fatigue/config');

async function ownRouteOr403(req, res) {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        res.status(403).json({ error: 'No autorizado' });
        return null;
    }
    return route;
}

// Config pública para el portal (qué método/duración) — sin datos sensibles.
router.get('/route/:id/fatigue/config', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const cfg = await fatigueCfg.getConfig(route.originBranchId);
    res.json({
        enabled: cfg.enabled, method: cfg.method, methodStart: cfg.methodStart,
        testDurationSec: cfg.testDurationSec, consentVersion: cfg.consentVersion,
        reactionFastMs: cfg.reactionFastMs, reactionSlowMs: cfg.reactionSlowMs,
        voiceSttEnabled: require('../services/fatigue/stt').isEnabled(),
        voiceAcousticEnabled: cfg.voiceAcousticEnabled,
        voiceMaxAttempts: cfg.voiceMaxAttempts, reactionAttempts: cfg.reactionAttempts,
    });
});

// Diagnóstico de la prueba de voz desde el cliente → visible en logs del server (Render).
// El reconocimiento corre en el navegador; esto solo refleja sus eventos para depurar.
router.post('/route/:id/fatigue/voz-log', requireDelivery, (req, res) => {
    const uid = res.locals.currentUser?.id;
    console.log('[fatiga-voz][cliente] user=' + uid + ' route=' + req.params.id, JSON.stringify(req.body));
    res.status(204).end();
});

// Prueba de voz SERVER-SIDE (compatible iOS): el cliente graba el audio y lo manda
// en base64; acá se transcribe (STT) y se compara con la frase. El audio es
// EFÍMERO: se procesa y se descarta, nunca se persiste ni se loguea (Ley 25.326).
router.post('/route/:id/fatigue/voz-stt', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const fatigueStt = require('../services/fatigue/stt');
    const phraseMatch = require('../services/fatigue/phraseMatch');
    if (!fatigueStt.isEnabled()) { return res.status(501).json({ error: 'STT no configurado en el servidor' }); }
    const { frase, audioBase64, mimeType } = req.body || {};
    if (!frase || !audioBase64) { return res.status(400).json({ error: 'Faltan datos (frase/audio)' }); }
    try {
        const buffer = Buffer.from(audioBase64, 'base64');
        if (buffer.length > 8 * 1024 * 1024) { return res.status(413).json({ error: 'Audio demasiado grande' }); }
        const ext = (mimeType && mimeType.includes('mp4')) ? 'mp4' : (mimeType && mimeType.includes('ogg')) ? 'ogg' : 'webm';
        const dicho = await fatigueStt.transcribe(buffer, { mimeType: mimeType || 'audio/webm', filename: `voz.${ext}` });
        const matchRatio = phraseMatch.similitudFrase(dicho, frase);
        // No se persiste el audio ni la transcripción cruda: solo se devuelve el match.
        res.json({ ok: true, matchRatio, dicho });
    } catch (e) {
        console.warn('[fatiga-voz][stt] error:', e.message);
        res.status(502).json({ error: 'No se pudo transcribir', detail: e.message });
    }
});

// US-1: registrar consentimiento (acepta o rechaza).
router.post('/route/:id/consent', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const accepted = req.body.accepted === true || req.body.accepted === 'true';
    const cfg = await fatigueCfg.getConfig(route.originBranchId);
    const result = await fatigueSvc.recordConsent({
        userId: res.locals.currentUser.id, routeId: route.id,
        branchId: route.originBranchId, accepted, version: cfg.consentVersion,
    });
    res.json({
        ok: true, accepted, checkId: result.check.id,
        disabled: result.disabled, rejections: result.rejections, max: result.max,
    });
});

// US-2/3/4/9: ejecutar la prueba y evaluar la fatiga.
router.post('/route/:id/fatigue-check', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const { checkId, method, metrics, triggerType } = req.body;
    if (!['VOZ', 'REACCION'].includes(method)) { return res.status(400).json({ error: 'Método inválido' }); }
    try {
        const result = await fatigueSvc.evaluate({
            checkId, userId: res.locals.currentUser.id, routeId: route.id,
            branchId: route.originBranchId, method, metrics: metrics || {},
            triggerType: triggerType || 'INICIO',
        });
        res.json({ ok: true, ...result, blocked: result.decision === 'BLOCKED' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// LGT-199 — re-chequeo en ruta (disparo manual: "Estoy detenido" + tiempos).
// Route y RouteStatus ya están importados al tope del archivo.
const fatigueRecheck = require('../services/fatigue/recheck');

// Estado del re-chequeo para el portal (¿debe hacer la prueba?, ¿descanso restante?).
router.get('/route/:id/fatigue/recheck-status', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const cfg = await fatigueCfg.getConfig(route.originBranchId);
    const status = await fatigueRecheck.getStatus(route.id, route, cfg);
    res.json({ ok: true, ...status });
});

// Esc.1/2: "Estoy detenido" — empieza a contar la detención.
// Ruta namespaced bajo /fatigue para no colisionar con la pausa operativa (/route/:id/pause|resume).
router.post('/route/:id/fatigue/stopped', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const cfg = await fatigueCfg.getConfig(route.originBranchId);
    const status = await fatigueRecheck.markStopped(route.id, route, cfg);
    res.json({ ok: true, ...status });
});

// Esc.7: "Reanudar marcha" antes del umbral descarta el conteo de detención.
router.post('/route/:id/fatigue/resume', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const cfg = await fatigueCfg.getConfig(route.originBranchId);
    const status = await fatigueRecheck.resume(route.id, route, cfg);
    res.json({ ok: true, ...status });
});

// Esc.3/4/9/10: ejecutar la prueba de re-chequeo y aplicar el resultado.
router.post('/route/:id/fatigue-recheck', requireDelivery, async (req, res) => {
    const route = await ownRouteOr403(req, res); if (!route) { return; }
    const { method, metrics } = req.body;
    if (!['VOZ', 'REACCION'].includes(method)) { return res.status(400).json({ error: 'Método inválido' }); }
    const cfg = await fatigueCfg.getConfig(route.originBranchId);

    // Esc.10: no permitir reintento antes de cumplir el descanso mínimo.
    const guard = await fatigueRecheck.guardRetry(route.id, cfg);
    if (!guard.ok) {
        return res.status(409).json({ error: 'Descanso en curso', restRemainingMin: guard.restRemainingMin });
    }

    const result = await fatigueSvc.evaluate({
        userId: res.locals.currentUser.id, routeId: route.id, branchId: route.originBranchId,
        method, metrics: metrics || {}, triggerType: 'EN_RUTA', cfg,
    });

    // Aplica el resultado al estado de la sesión y al estado de la ruta.
    await fatigueRecheck.onRecheckResult(route.id, result.decision, cfg);
    const newStatus = result.decision === 'BLOCKED' ? RouteStatus.PAUSED_FATIGUE : RouteStatus.IN_ROUTE;
    await Route.update({ statusId: newStatus }, { where: { id: route.id } });
    // LGT-199 Esc.4: el conductor completó la prueba → cerrar avisos de omisión pendientes.
    await fatigueSvc.clearRecheckOmission({ routeId: route.id, actorId: res.locals.currentUser.id })
        .catch(e => console.error('clearRecheckOmission', e.message));

    res.json({ ok: true, ...result, blocked: result.decision === 'BLOCKED' });
});

// US-11: revocar consentimiento.
router.post('/fatigue/consent/revoke', requireDelivery, async (req, res) => {
    await fatigueSvc.revokeConsent({ userId: res.locals.currentUser.id });
    res.json({ ok: true });
});

// US-13: mis datos de fatiga (acceso).
router.get('/fatigue/mis-datos', requireDelivery, async (req, res) => {
    const rows = await fatigueSvc.getDriverHistory(res.locals.currentUser.id);
    res.render('delivery/misDatosFatiga', { checks: rows.map(r => r.toJSON()) });
});

// US-13: solicitar supresión de mis datos.
router.post('/fatigue/mis-datos/suprimir', requireDelivery, async (req, res) => {
    const n = await fatigueSvc.suppressDriverData({ userId: res.locals.currentUser.id, actorId: res.locals.currentUser.id });
    res.json({ ok: true, deleted: n });
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
    // Alerta dedicada de alta severidad (punto 4): línea de log distinta y etiquetada para que
    // el monitoreo pueda enganchar y paginar a la central. El evento ya queda persistido arriba.
    console.error('[ALERT][PANIC]', JSON.stringify({
        panicId:     ev.id,
        userId:      res.locals.currentUser.id,
        routeId:     routeId || null,
        hasLocation: (latitude ?? null) !== null && (longitude ?? null) !== null,
        latitude:    latitude || null,
        longitude:   longitude || null,
        message:     message || null,
        at:          new Date().toISOString(),
    }));
    res.json({ ok: true, panicId: ev.id });
});

// === Telemetría del copiloto de voz (punto 4) ===
// Mide la tasa de aciertos / "no entendí" para mejorar el reconocimiento. NO recibe audio ni
// el texto dictado (privacidad): solo la intención detectada, puntaje y latencia. Best-effort:
// llega por sendBeacon y nunca debe afectar la operación, por eso responde 204 sin validar mucho.
router.post('/voice/telemetry', requireDelivery, (req, res) => {
    try {
        const b = req.body || {};
        console.log('[voice-telemetry]', JSON.stringify({
            userId:    res.locals.currentUser ? res.locals.currentUser.id : null,
            event:     b.event || null,
            intent:    b.intent || null,
            score:     b.score ?? null,
            strong:    b.strong ?? null,
            applied:   b.applied ?? null,
            a:         b.a || null,
            b:         b.b || null,
            words:     b.words ?? null,
            source:    b.source || null,
            offline:   b.offline ?? null,
            latencyMs: b.latencyMs ?? null,
            routeId:   b.routeId || null,
            ts:        b.ts || Date.now(),
        }));
    } catch { /* la telemetría nunca rompe la operación */ }
    res.status(204).end();
});

// === Sprint 3 - 2.4 Cancelar ruta (antes de iniciarla o durante) ===
// Reasons formales: DRIVER_UNAVAILABLE, VEHICLE_OUT_SERVICE, WEATHER, INCIDENT, OPERATIONAL, OTHER.
// Todas las entregas pendientes vuelven a AT_BRANCH y se desasignan del driver.
router.post('/route/:id/cancel', requireDelivery, async (req, res) => {
    const { RouteFailureReason } = require('../constants/enums');
    const route = await routeModel.getById(req.params.id);
    if (!route) { return res.status(404).json({ error: 'Ruta no encontrada' }); }
    const isOwner = route.transport?.driverUserId === res.locals.currentUser.id;
    const isAdmin = res.locals.currentUser?.roleId === 1 || res.locals.currentUser?.roleId === 4;
    if (!isOwner && !isAdmin) { return res.status(403).json({ error: 'No autorizado' }); }
    if (route.statusId === RouteStatus.FINISHED || route.statusId === RouteStatus.CANCELLED) {
        return res.status(409).json({ error: 'La ruta ya está cerrada.' });
    }
    const reason = String(req.body.reason || '').trim();
    const detail = String(req.body.detail || '').trim();
    if (!Object.values(RouteFailureReason).includes(reason)) {
        return res.status(400).json({ error: 'Motivo obligatorio (DRIVER_UNAVAILABLE / VEHICLE_OUT_SERVICE / WEATHER / INCIDENT / OPERATIONAL / OTHER).' });
    }

    const stops = (route.stops || []).filter(s => s.stopType === 'delivery' && s.shipmentId && !s.completed);
    let returned = 0;
    await sequelize.transaction(async (t) => {
        for (const s of stops) {
            await stateMachine.transition({
                shipmentId: s.shipmentId,
                toStatusId: Status.AT_BRANCH.id,
                actor:      res.locals.currentUser,
                branchId:   route.originBranchId,
                comment:    `Ruta #${route.id} cancelada (${reason}). ${detail || ''}`.trim(),
                eventType:  'RETURNED_TO_BRANCH',
                transaction: t,
            }).catch(e => console.error('cancel route shipment transition', s.shipmentId, e.message));
            returned++;
        }
        await Route.update({
            statusId:        RouteStatus.CANCELLED,
            cancelReason:    reason,
            cancelDetail:    detail || null,
            cancelledAt:     new Date(),
            cancelledByUserId: res.locals.currentUser.id,
            returnedToBranch: true,
        }, { where: { id: route.id }, transaction: t });
    });
    res.json({ ok: true, returnedShipments: returned });
});

// === Sprint 3 - 2.4 Interrumpir ruta (estado intermedio entre activa y cancelada)
// Mantiene las paradas completadas pero marca al resto para regreso a sucursal.
router.post('/route/:id/interrupt', requireDelivery, async (req, res) => {
    const { RouteFailureReason } = require('../constants/enums');
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    if (route.statusId !== RouteStatus.IN_ROUTE) {
        return res.status(409).json({ error: 'Sólo rutas en curso se pueden interrumpir.' });
    }
    const reason = String(req.body.reason || '').trim();
    const detail = String(req.body.detail || '').trim();
    if (!Object.values(RouteFailureReason).includes(reason)) {
        return res.status(400).json({ error: 'Motivo obligatorio.' });
    }

    const pending = (route.stops || []).filter(s => s.stopType === 'delivery' && s.shipmentId && !s.completed);
    await sequelize.transaction(async (t) => {
        await Route.update({
            statusId:        RouteStatus.INTERRUPTED,
            interruptedAt:   new Date(),
            interruptReason: reason,
            cancelDetail:    detail || null,
            returnedToBranch: true,
        }, { where: { id: route.id }, transaction: t });
        for (const s of pending) {
            await stateMachine.transition({
                shipmentId: s.shipmentId,
                toStatusId: Status.AT_BRANCH.id,
                actor:      res.locals.currentUser,
                branchId:   route.originBranchId,
                comment:    `Ruta #${route.id} interrumpida (${reason}). ${detail || ''}`.trim(),
                eventType:  'RETURNED_TO_BRANCH',
                transaction: t,
            }).catch(e => console.error('interrupt shipment transition', s.shipmentId, e.message));
        }
    });
    res.json({ ok: true, pendingReturned: pending.length });
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

        // Paquete dañado NO va a la devolución por escaneo: ese caso lo define el
        // cliente (se abrió incidencia). Solo se devuelven a sucursal los fallidos
        // por otros motivos (ausente, dirección errónea, etc.).
        const isDamageReason = (code, text) => {
            if (['paquete_dañado', 'paquete_danado'].includes(code)) { return true; }
            const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            return /\bdanad/.test(t); // "dañado" / "danado"
        };
        const failedShipmentIds = failed.map(s => s.shipmentId).filter(Boolean);
        const damagedShipmentIds = new Set();
        if (failedShipmentIds.length) {
            const { FailedAttempt } = require('../models/failedAttempt');
            const attempts = await FailedAttempt.findAll({
                where: { shipmentId: { [Op.in]: failedShipmentIds } },
                order: [['attemptDate', 'DESC']],
            });
            // Toma el intento más reciente por envío (la lista ya viene ordenada DESC).
            const latestByShipment = new Map();
            for (const a of attempts) { if (!latestByShipment.has(a.shipmentId)) { latestByShipment.set(a.shipmentId, a); } }
            for (const [sid, a] of latestByShipment) {
                if (isDamageReason(a.reasonCode, a.reason)) { damagedShipmentIds.add(sid); }
            }
        }
        const failedForReturn = failed.filter(s => !damagedShipmentIds.has(s.shipmentId));

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
            failedStops:    failedForReturn,
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
                eventType:  'RETURNED_TO_BRANCH',
            });
            // Sprint 3 - 2.3 notif SHIPMENT_RETURNED_BRANCH
            const { NotificationEvent } = require('../constants/enums');
            const shipmentCtrl = require('../controllers/shipment');
            shipmentCtrl.notifyShipmentEvent(NotificationEvent.SHIPMENT_RETURNED_BRANCH, shipment.id)
                .catch(e => console.error('notif RETURNED_BRANCH', shipment.id, e.message));
        } catch (transitionErr) {
            // No bloqueamos el scan (la fila ReturnToBranchScan ya existe),
            // pero logueamos para detectar reglas faltantes en state machine.
            console.error('return-scan transition err:', transitionErr.code || '', transitionErr.message);
        }
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
    // Sprint 3 - 2.3 notif SHIPMENT_RESCHEDULED a destinatario
    const { NotificationEvent } = require('../constants/enums');
    const shipmentCtrl = require('../controllers/shipment');
    for (const s of failed) {
        shipmentCtrl.notifyShipmentEvent(NotificationEvent.SHIPMENT_RESCHEDULED, s.id)
            .catch(e => console.error('notif RESCHEDULED', s.id, e.message));
    }
    res.json({ ok: true, rescheduled });
});

module.exports = router;