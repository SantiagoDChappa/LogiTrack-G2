const { Op } = require('sequelize');
const QRCode = require('qrcode');
const { Shipment } = require('../models/shipment');
const { Address } = require('../models/address');
const { Zone } = require('../models/zone');
const { Person } = require('../models/person');
const branchModel = require('../models/branch');
const transportModel = require('../models/transport');
const routeModel = require('../models/route');
const { Route, RouteStatus } = require('../models/route');
const { RouteStop } = require('../models/routeStop');
const { Status: StatusEnum, RoleType } = require('../constants/enums');
const optimizer = require('../services/routeOptimizer.service');
const sequelize = require('../database/connection');
const shipmentHistoryModel = require('../models/shipmentHistory');
const stateMachine = require('../services/shipmentStateMachine');
const { buildAutoComment } = require('../services/shipmentStateMachine');
const { resolveUserBranchCoords } = require('../utils/eventLocation');

const isAdminUser = (user) => user?.roleId === RoleType.ADMIN.id;

const resolveBranchId = (user, source) => {
    if (!isAdminUser(user)) {
        return user?.branchId || null;
    }
    const raw = source?.branchId;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) { return n; }
    return user?.branchId || null;
};

const optimizeForm = async (req, res) => {
    const user     = res.locals.currentUser;
    const isAdmin  = isAdminUser(user);
    const branchId = resolveBranchId(user, req.query);
    const branches = isAdmin ? await branchModel.getAll() : [];

    if (!branchId) {
        return res.render('route/optimize', {
            shipments: [], transports: [], branchId: null,
            branches, isAdmin,
        });
    }

    const [shipments, transports] = await Promise.all([
        Shipment.findAll({
            where: {
                statusId: { [Op.in]: [StatusEnum.PENDING.id, StatusEnum.AT_BRANCH.id, StatusEnum.IN_PREPARATION.id] },
                currentBranchId: branchId,
            },
            include: [
                { model: Address, as: 'address', required: false },
                { model: Zone,    as: 'zone',    required: false },
                { model: Person,  as: 'recipient', required: false },
            ],
            order: [['createdAt', 'ASC']],
        }),
        transportModel.getEnabledForBranch(branchId),
    ]);

    const predictionModel = require('../models/shipmentPrediction');
    const predMap = await predictionModel.getLatestByShipmentIds(shipments.map(s => s.id));
    for (const s of shipments) { s.latestPrediction = predMap.get(s.id) || null; }

    res.render('route/optimize', {
        shipments, transports, branchId,
        branches, isAdmin,
    });
};

const previewOptimization = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }

    const shipmentIds = [].concat(req.body.shipmentIds || []).map(Number).filter(Boolean);
    if (shipmentIds.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar al menos un envío' });
    }
    const excludeTransportIds = [].concat(req.body.excludeTransportIds || []).map(Number).filter(Boolean);

    const result = await optimizer.optimizeRoutes({
        shipmentIds, supervisorBranchId: branchId, excludeTransportIds,
    });
    res.json(result);
};

const recalcManual = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }
    const assignments = req.body.assignments || [];
    if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'No hay asignaciones' });
    }
    const result = await optimizer.optimizeManual({ assignments, supervisorBranchId: branchId });
    res.json(result);
};

const persistProposal = async ({ p, branchId, actor, t }) => {
    const route = await Route.create({
        transportId:     p.transportId,
        originBranchId:  branchId,
        statusId:        RouteStatus.PLANNED,
        totalDistanceKm: p.totalDistanceKm || 0,
        totalCost:       p.totalCost || 0,
        totalWeightKg:   p.totalWeightKg || 0,
        totalVolumeM3:   p.totalVolumeM3 || 0,
    }, { transaction: t });

    const stops = (p.stops || []);
    for (const s of stops) {
        if (s.stopType === 'pickup') {
            await RouteStop.create({
                routeId: route.id, sequence: s.sequence, stopType: 'pickup',
                branchId: s.branchId, shipmentId: null,
                lat: s.lat, lng: s.lng,
                distanceFromPrevKm: s.distanceFromPrevKm || 0,
            }, { transaction: t });
        } else if (s.stopType === 'service') {
            await RouteStop.create({
                routeId: route.id, sequence: s.sequence, stopType: 'service',
                branchId: s.branchId, shipmentId: null,
                lat: s.lat, lng: s.lng,
                distanceFromPrevKm: s.distanceFromPrevKm || 0,
            }, { transaction: t });
        } else {
            await RouteStop.create({
                routeId: route.id, sequence: s.sequence, stopType: 'delivery',
                branchId: null, shipmentId: s.shipmentId,
                lat: s.lat, lng: s.lng,
                distanceFromPrevKm: s.distanceFromPrevKm || 0,
            }, { transaction: t });
        }
    }

    const transport = await transportModel.getById(p.transportId);
    const driverId = transport?.driverUserId || null;
    const driverName = transport?.driver?.fullName || null;
    const transportName = transport?.name || `#${p.transportId}`;
    const shipmentIds = (p.shipmentIds || []);
    if (shipmentIds.length > 0) {
        const prev = await Shipment.findAll({
            where: { id: { [Op.in]: shipmentIds } },
            attributes: ['id', 'statusId'],
            transaction: t,
        });
        const prevById = new Map(prev.map(s => [s.id, s.statusId]));
        await Shipment.update(
            { statusId: StatusEnum.ASSIGNED.id, deliveryUserId: driverId },
            { where: { id: { [Op.in]: shipmentIds } }, transaction: t }
        );
        for (const sid of shipmentIds) {
            const fromStatusId = prevById.get(sid) ?? StatusEnum.PENDING.id;
            const comment = buildAutoComment({
                fromStatusId, toStatusId: StatusEnum.ASSIGNED.id,
                actor, extras: { routeId: route.id, driverName, transportName },
            });
            await shipmentHistoryModel.create({
                shipmentId: sid, fromStatusId, toStatusId: StatusEnum.ASSIGNED.id,
                comment, userId: actor.id || null,
                eventType: 'ROUTE_ASSIGNED', branchId,
                transaction: t,
            });
        }
    }
    return route.id;
};

const confirmOne = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }
    const proposal = req.body.proposal;
    if (!proposal || !proposal.transportId) { return res.status(400).json({ error: 'Propuesta inválida' }); }
    try {
        const actor = res.locals.currentUser || {};
        const routeId = await sequelize.transaction(t => persistProposal({ p: proposal, branchId, actor, t }));
        res.json({ ok: true, routeId });
    } catch (e) {
        console.error('confirmOne err', e);
        res.status(500).json({ error: e.message });
    }
};

const confirm = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }

    const proposals = req.body.proposals || [];
    if (!Array.isArray(proposals) || proposals.length === 0) {
        return res.status(400).json({ error: 'No hay propuestas para confirmar' });
    }

    const createdRoutes = [];
    const actor = res.locals.currentUser || {};
    await sequelize.transaction(async (t) => {
        for (const p of proposals) {
            const id = await persistProposal({ p, branchId, actor, t });
            createdRoutes.push(id);
        }
    });
    res.json({ ok: true, routeIds: createdRoutes });
};

const list = async (req, res) => {
    const user     = res.locals.currentUser;
    const isAdmin  = isAdminUser(user);
    const branchId = isAdmin
        ? (Number(req.query.branchId) || null)
        : (user?.branchId || null);
    const branches = isAdmin ? await branchModel.getAll() : [];
    const routes   = await routeModel.getAllByBranch(branchId);
    res.render('route/index', { routes, branches, branchId, isAdmin });
};

const detail = async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route) { return res.status(404).send('Ruta no encontrada'); }
    res.render('route/detail', { route });
};

const getQR = async (req, res) => {
    try {
        const { id } = req.params;
        const route = await routeModel.getById(id);
        if (!route) { return res.status(404).send('Ruta no encontrada'); }
        const url = `${req.protocol}://${req.get('host')}/route/scan/${route.id}`;
        const buffer = await QRCode.toBuffer(url, { width: 320, margin: 2 });
        res.setHeader('Content-Type', 'image/png');
        res.send(buffer);
    } catch (err) {
        console.error('ERROR route getQR:', err.message);
        res.status(500).send('Error generando QR');
    }
};

const getScanPage = async (req, res) => {
    const route = await routeModel.getById(req.params.id);
    if (!route) { return res.status(404).render('route/scan', { route: null, error: 'Ruta no encontrada', success: null, summary: null }); }
    const success = req.query.success === '1';
    const summary = req.query.summary || null;
    res.render('route/scan', { route, error: null, success, summary });
};

const dispatchRoute = async (req, res) => {
    const routeId = Number(req.params.id);
    const currentUser = res.locals.currentUser;
    try {
        const route = await routeModel.getById(routeId);
        if (!route) { return res.status(404).redirect(`/route/scan/${routeId}`); }

        if (currentUser.roleId === RoleType.DELIVERY.id
            && route.transport?.driverUserId
            && route.transport.driverUserId !== currentUser.id) {
            return res.status(403).render('route/scan', { route, error: 'Esta ruta no está asignada a vos.', success: null, summary: null });
        }

        const coords = await resolveUserBranchCoords(currentUser.id);
        const deliveryIds = (route.stops || [])
            .filter(s => s.stopType === 'delivery' && s.shipmentId)
            .map(s => s.shipmentId);

        let transitioned = 0;
        let skipped = 0;
        for (const sid of deliveryIds) {
            try {
                await stateMachine.transition({
                    shipmentId: sid,
                    toStatusId: StatusEnum.IN_TRANSIT.id,
                    actor:      currentUser,
                    branchId:   coords.branchId,
                    latitude:   coords.latitude,
                    longitude:  coords.longitude,
                });
                transitioned++;
            } catch (err) {
                if (err && err.name === 'StateMachineError'
                    && ['INVALID_TRANSITION', 'FORBIDDEN_ROLE'].includes(err.code)) {
                    skipped++;
                    continue;
                }
                throw err;
            }
        }

        if (route.statusId === RouteStatus.PLANNED) {
            await Route.update({ statusId: RouteStatus.IN_ROUTE }, { where: { id: routeId } });
        }

        const summary = encodeURIComponent(`${transitioned} envío(s) en tránsito · ${skipped} omitido(s)`);
        res.redirect(`/route/scan/${routeId}?success=1&summary=${summary}`);
    } catch (err) {
        console.error('ERROR dispatchRoute:', err.message);
        const route = await routeModel.getById(routeId).catch(() => null);
        res.status(500).render('route/scan', { route, error: 'Error interno al despachar ruta.', success: null, summary: null });
    }
};

module.exports = { optimizeForm, previewOptimization, recalcManual, confirm, confirmOne, list, detail, getQR, getScanPage, dispatchRoute };
