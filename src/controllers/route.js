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

    const { Transport } = require('../models/transport');
    const { User } = require('../models/user');
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
        Transport.findAll({
            where: { branchId },
            include: [
                { model: User, as: 'driver', required: false },
                { model: Zone, as: 'zones',  required: false, through: { attributes: [] } },
            ],
            order: [['name', 'ASC']],
        }),
    ]);

    const activeRoutes = await Route.findAll({
        where: {
            transportId: { [Op.in]: transports.map(t => t.id) },
            statusId: { [Op.in]: [RouteStatus.PLANNED, RouteStatus.IN_ROUTE] },
        },
        attributes: ['id', 'transportId', 'statusId'],
    }).catch(() => []);
    const activeRouteByTx = new Map(activeRoutes.map(r => [r.transportId, r]));
    const routeStatusLabel = { [RouteStatus.PLANNED]: 'Planificada', [RouteStatus.IN_ROUTE]: 'En curso' };
    for (const t of transports) {
        const ar = activeRouteByTx.get(t.id);
        t.activeRoute = ar ? { id: ar.id, statusLabel: routeStatusLabel[ar.statusId] || 'Activa' } : null;
    }

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
        const { Transport } = require('../models/transport');
        const transport = await Transport.findOne({ where: { id: proposal.transportId, branchId, enabled: true } });
        if (!transport) { return res.status(400).json({ error: 'Transporte no disponible' }); }

        const shipmentIds = (proposal.shipmentIds || []).map(Number).filter(Boolean);
        if (shipmentIds.length > 0) {
            const ships = await Shipment.findAll({ where: { id: { [Op.in]: shipmentIds }, currentBranchId: branchId } });
            const num = (v) => (v === null || v === undefined ? 0 : Number(v));
            const totalW = ships.reduce((s, sh) => s + num(sh.weightKg), 0);
            const totalV = ships.reduce((s, sh) => s + num(sh.volumeM3), 0);
            if (totalW > num(transport.maxWeightKg)) {
                return res.status(400).json({ error: `Peso total ${totalW.toFixed(2)}kg supera la capacidad del transporte (${num(transport.maxWeightKg)}kg)` });
            }
            if (totalV > num(transport.maxVolumeM3)) {
                return res.status(400).json({ error: `Volumen total ${totalV.toFixed(3)}m³ supera la capacidad del transporte (${num(transport.maxVolumeM3)}m³)` });
            }
        }

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

// Append: sumar envios a una ruta PLANIFICADA existente (piggyback)
const appendToRoute = async (req, res) => {
    const routeId = Number(req.params.id);
    const branchId = resolveBranchId(res.locals.currentUser, req.body);
    if (!branchId) { return res.status(400).json({ error: 'Sin sucursal asignada' }); }

    const shipmentIds = [].concat(req.body.shipmentIds || []).map(Number).filter(Boolean);
    if (shipmentIds.length === 0) { return res.status(400).json({ error: 'No hay envíos para agregar' }); }

    try {
        const route = await routeModel.getById(routeId);
        if (!route) { return res.status(404).json({ error: 'Ruta no encontrada' }); }
        if (route.originBranchId !== branchId) { return res.status(403).json({ error: 'La ruta no pertenece a tu sucursal' }); }
        if (route.statusId !== RouteStatus.PLANNED) {
            return res.status(422).json({ error: 'Solo se pueden sumar envíos a rutas en estado Planificada. Estado actual no permite modificación.' });
        }

        const { Transport } = require('../models/transport');
        const transport = await Transport.findByPk(route.transportId);
        if (!transport || !transport.enabled) { return res.status(422).json({ error: 'El transporte de esta ruta no está habilitado.' }); }

        const num = (v) => (v === null || v === undefined ? 0 : Number(v));
        const newShipments = await Shipment.findAll({
            where: { id: { [Op.in]: shipmentIds }, currentBranchId: branchId },
            include: [{ model: Address, as: 'address', required: false }],
        });
        if (newShipments.length !== shipmentIds.length) {
            return res.status(422).json({ error: 'Algún envío no pertenece a la sucursal o no existe.' });
        }
        for (const s of newShipments) {
            if (![StatusEnum.PENDING.id, StatusEnum.AT_BRANCH.id, StatusEnum.IN_PREPARATION.id].includes(s.statusId)) {
                return res.status(422).json({ error: `Envío ${s.trackingId} no está en estado ruteable (actual: ${s.statusId}).` });
            }
            if (!s.address?.lat || !s.address?.lng) {
                return res.status(422).json({ error: `Envío ${s.trackingId} sin geolocalización; corregí la dirección antes de sumarlo.` });
            }
        }

        const existingW = num(route.totalWeightKg);
        const existingV = num(route.totalVolumeM3);
        const addedW = newShipments.reduce((a, s) => a + num(s.weightKg), 0);
        const addedV = newShipments.reduce((a, s) => a + num(s.volumeM3), 0);
        if (existingW + addedW > num(transport.maxWeightKg)) {
            return res.status(422).json({ error: `Peso total (${(existingW + addedW).toFixed(2)}kg) supera la capacidad del transporte (${num(transport.maxWeightKg)}kg).` });
        }
        if (existingV + addedV > num(transport.maxVolumeM3)) {
            return res.status(422).json({ error: `Volumen total (${(existingV + addedV).toFixed(3)}m³) supera la capacidad del transporte (${num(transport.maxVolumeM3)}m³).` });
        }

        const haversineKm = (a, b) => {
            const toRad = d => d * Math.PI / 180;
            const R = 6371;
            const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
            const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(x));
        };

        const sortedStops = (route.stops || []).sort((a, b) => a.sequence - b.sequence);
        const lastStop = sortedStops[sortedStops.length - 1];
        let extraKm = 0;
        const transaction = await sequelize.transaction();
        try {
            let lastPoint = { lat: num(lastStop.lat), lng: num(lastStop.lng) };
            let nextSeq = (lastStop.sequence || sortedStops.length) + 1;
            for (const s of newShipments) {
                const pt = { lat: num(s.address.lat), lng: num(s.address.lng) };
                const legKm = haversineKm(lastPoint, pt);
                extraKm += legKm;
                await RouteStop.create({
                    routeId, sequence: nextSeq++, stopType: 'delivery',
                    branchId: null, shipmentId: s.id,
                    lat: pt.lat, lng: pt.lng,
                    distanceFromPrevKm: Number(legKm.toFixed(2)),
                }, { transaction });
                lastPoint = pt;
            }
            const newTotalKm = num(route.totalDistanceKm) + extraKm;
            const newTotalCost = num(route.totalCost) + extraKm * num(transport.costPerKm);
            await Route.update({
                totalDistanceKm: Number(newTotalKm.toFixed(2)),
                totalCost: Number(newTotalCost.toFixed(2)),
                totalWeightKg: Number((existingW + addedW).toFixed(2)),
                totalVolumeM3: Number((existingV + addedV).toFixed(3)),
            }, { where: { id: routeId }, transaction });

            const actor = res.locals.currentUser || {};
            for (const s of newShipments) {
                const fromStatusId = s.statusId;
                await Shipment.update(
                    { statusId: StatusEnum.ASSIGNED.id, deliveryUserId: transport.driverUserId || null },
                    { where: { id: s.id }, transaction }
                );
                const comment = buildAutoComment({
                    fromStatusId, toStatusId: StatusEnum.ASSIGNED.id,
                    actor, extras: { routeId, driverName: route.transport?.driver?.fullName || null, transportName: transport.name },
                });
                await shipmentHistoryModel.create({
                    shipmentId: s.id, fromStatusId, toStatusId: StatusEnum.ASSIGNED.id,
                    comment: (comment || '') + ` (Piggyback: sumado a ruta existente #${routeId}).`,
                    userId: actor.id || null, eventType: 'ROUTE_PIGGYBACK', branchId,
                    transaction,
                });
            }
            await transaction.commit();
            res.json({ ok: true, routeId, addedCount: newShipments.length, extraKm: Number(extraKm.toFixed(2)) });
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    } catch (err) {
        console.error('ERROR appendToRoute:', err);
        res.status(500).json({ error: err.message || 'Error al sumar envíos a la ruta' });
    }
};

// Revertir ruta planificada: borra stops, devuelve envios a estado previo, marca ruta CANCELLED.
// Validaciones:
//  - Ruta debe existir
//  - Solo se permite si statusId === PLANNED (no IN_ROUTE, ni FINISHED, ni CANCELLED)
//  - Todos los envios delivery deben estar aun en ASSIGNED (si alguno ya transito, bloquea)
//  - Permiso: admin o supervisor de la sucursal origen
const revertRoute = async (req, res) => {
    const routeId = Number(req.params.id);
    const actor = res.locals.currentUser;
    if (!Number.isInteger(routeId) || routeId <= 0) {
        return res.status(400).json({ error: 'ID de ruta invalido' });
    }
    try {
        const route = await routeModel.getById(routeId);
        if (!route) { return res.status(404).json({ error: 'Ruta no encontrada' }); }

        if (!isAdminUser(actor) && actor?.branchId !== route.originBranchId) {
            return res.status(403).json({ error: 'No tenes permisos para revertir esta ruta (sucursal distinta).' });
        }

        const statusLabels = {
            [RouteStatus.PLANNED]: 'Planificada',
            [RouteStatus.IN_ROUTE]: 'En curso',
            [RouteStatus.FINISHED]: 'Completada',
            [RouteStatus.CANCELLED]: 'Cancelada',
        };
        if (route.statusId === RouteStatus.IN_ROUTE) {
            return res.status(422).json({ error: 'La ruta ya esta En Curso (el repartidor escaneo el QR de salida). No se puede revertir desde aca. Cancela primero el despacho o espera a que termine.' });
        }
        if (route.statusId === RouteStatus.FINISHED) {
            return res.status(422).json({ error: 'La ruta ya esta Completada. No se puede revertir una ruta cerrada.' });
        }
        if (route.statusId === RouteStatus.CANCELLED) {
            return res.status(422).json({ error: 'La ruta ya fue Cancelada/Revertida previamente.' });
        }
        if (route.statusId !== RouteStatus.PLANNED) {
            return res.status(422).json({ error: `Estado actual "${statusLabels[route.statusId] || route.statusId}" no es revertible. Solo rutas Planificadas pueden deshacerse.` });
        }

        const deliveryStops = (route.stops || []).filter(s => s.stopType === 'delivery' && s.shipmentId);
        if (deliveryStops.length === 0) {
            // Sin envios: solo cancelar la ruta
            await sequelize.transaction(async (t) => {
                await RouteStop.destroy({ where: { routeId }, transaction: t });
                await Route.update({ statusId: RouteStatus.CANCELLED }, { where: { id: routeId }, transaction: t });
            });
            return res.json({ ok: true, revertedShipments: 0, routeId });
        }

        const shipmentIds = deliveryStops.map(s => s.shipmentId);
        const ships = await Shipment.findAll({ where: { id: { [Op.in]: shipmentIds } }, attributes: ['id', 'trackingId', 'statusId'] });
        const statusNameById = Object.fromEntries(Object.values(StatusEnum).map(s => [s.id, s.description]));

        const blockers = [];
        for (const s of ships) {
            if (s.statusId !== StatusEnum.ASSIGNED.id) {
                blockers.push({ id: s.id, trackingId: s.trackingId, currentStatus: statusNameById[s.statusId] || `Estado ${s.statusId}` });
            }
        }
        if (blockers.length > 0) {
            const lines = blockers.map(b => `${b.trackingId} (${b.currentStatus})`).join('; ');
            return res.status(422).json({
                error: `No se puede revertir: ${blockers.length} envio(s) ya cambiaron de estado y no estan mas en "Asignado". Detalles: ${lines}. Si es necesario, devolve manualmente esos envios al estado anterior antes de revertir.`,
                blockers,
            });
        }

        // Buscar fromStatusId del ultimo ROUTE_ASSIGNED por envio (para volver al estado original)
        const histRows = await shipmentHistoryModel.ShipmentHistory.findAll({
            where: { shipmentId: { [Op.in]: shipmentIds }, eventType: 'ROUTE_ASSIGNED' },
            order: [['changedAt', 'DESC']],
        }).catch(() => []);
        const prevStatusByShipment = new Map();
        for (const h of histRows) {
            if (!prevStatusByShipment.has(h.shipmentId) && h.fromStatusId) {
                prevStatusByShipment.set(h.shipmentId, h.fromStatusId);
            }
        }

        let reverted = 0;
        await sequelize.transaction(async (t) => {
            for (const s of ships) {
                const prevStatus = prevStatusByShipment.get(s.id) || StatusEnum.PENDING.id;
                await Shipment.update(
                    { statusId: prevStatus, deliveryUserId: null },
                    { where: { id: s.id }, transaction: t }
                );
                await shipmentHistoryModel.create({
                    shipmentId: s.id,
                    fromStatusId: StatusEnum.ASSIGNED.id,
                    toStatusId: prevStatus,
                    comment: `Ruta #${routeId} revertida por ${actor?.fullName || 'supervisor'}. Envio devuelto a "${statusNameById[prevStatus] || 'estado previo'}".`,
                    userId: actor?.id || null,
                    eventType: 'ROUTE_REVERTED',
                    branchId: route.originBranchId,
                    transaction: t,
                });
                reverted++;
            }
            await RouteStop.destroy({ where: { routeId }, transaction: t });
            await Route.update({ statusId: RouteStatus.CANCELLED }, { where: { id: routeId }, transaction: t });
        });

        res.json({ ok: true, revertedShipments: reverted, routeId });
    } catch (err) {
        console.error('ERROR revertRoute:', err);
        res.status(500).json({ error: err.message || 'Error interno al revertir la ruta' });
    }
};

module.exports = { optimizeForm, previewOptimization, recalcManual, confirm, confirmOne, list, detail, getQR, getScanPage, dispatchRoute, revertRoute, appendToRoute };
