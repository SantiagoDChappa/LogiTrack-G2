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

router.get('/', requireDelivery, async (req, res) => {
    try {
        const userId = res.locals.currentUser.id;
        const [shipments, activeRoute] = await Promise.all([
            shipmentModel.search({ deliveryUserId: userId }),
            routeModel.getActiveByDriver(userId),
        ]);
        res.render('delivery/home', { shipments, activeRoute });
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
        res.render('delivery/route', { route });
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
    const stop = (route.stops || []).find(s => s.id === Number(req.params.stopId));
    if (!stop) { return res.status(404).json({ error: 'Stop no encontrado' }); }
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
    const stop = (route.stops || []).find(s => s.id === Number(req.params.stopId));
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

// Marcar intento fallido (require comment)
router.post('/route/:id/stop/:stopId/failed', requireDelivery, async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const stop = (route.stops || []).find(s => s.id === Number(req.params.stopId));
    if (!stop || !stop.shipmentId) { return res.status(404).json({ error: 'Stop no es entrega' }); }
    const comment = (req.body.comment || '').trim();
    if (!comment) { return res.status(400).json({ error: 'Motivo obligatorio' }); }
    try {
        await stateMachine.transition({
            shipmentId: stop.shipmentId,
            toStatusId: Status.FAILED_ATTEMPT.id,
            actor: res.locals.currentUser,
            comment,
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(422).json({ error: e.message });
    }
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