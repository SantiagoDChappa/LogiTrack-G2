const { Op } = require('sequelize');
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

    res.render('route/optimize', {
        shipments, transports, branchId,
        branches, isAdmin,
    });
};

const previewOptimization = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }

    const shipmentIds = [].concat(req.body.shipmentIds || []).map(Number).filter(Boolean);
    const transportIds = [].concat(req.body.transportIds || []).map(Number).filter(Boolean);

    if (shipmentIds.length === 0 || transportIds.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar envios y transportes' });
    }

    const result = await optimizer.optimizeRoutes({
        shipmentIds, transportIds, supervisorBranchId: branchId,
    });
    res.json(result);
};

const confirm = async (req, res) => {
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }

    const proposals = req.body.proposals || [];
    if (!Array.isArray(proposals) || proposals.length === 0) {
        return res.status(400).json({ error: 'No hay propuestas para confirmar' });
    }

    const createdRoutes = [];
    await sequelize.transaction(async (t) => {
        for (const p of proposals) {
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
                        routeId: route.id,
                        sequence: s.sequence,
                        stopType: 'pickup',
                        branchId: s.branchId,
                        shipmentId: null,
                        lat: s.lat, lng: s.lng,
                        distanceFromPrevKm: s.distanceFromPrevKm || 0,
                    }, { transaction: t });
                } else {
                    await RouteStop.create({
                        routeId: route.id,
                        sequence: s.sequence,
                        stopType: 'delivery',
                        branchId: null,
                        shipmentId: s.shipmentId,
                        lat: s.lat, lng: s.lng,
                        distanceFromPrevKm: s.distanceFromPrevKm || 0,
                    }, { transaction: t });
                }
            }

            // Asignar conductor y marcar shipments como Asignado
            const transport = await transportModel.getById(p.transportId);
            const driverId = transport?.driverUserId || null;
            const shipmentIds = (p.shipmentIds || []);
            if (shipmentIds.length > 0) {
                await Shipment.update(
                    { statusId: StatusEnum.ASSIGNED.id, deliveryUserId: driverId },
                    { where: { id: { [Op.in]: shipmentIds } }, transaction: t }
                );
            }

            createdRoutes.push(route.id);
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

module.exports = { optimizeForm, previewOptimization, confirm, list, detail };
