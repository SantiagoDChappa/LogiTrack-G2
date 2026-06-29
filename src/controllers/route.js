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
    const [shipmentsRaw, transports] = await Promise.all([
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

    // Retiro por sucursal: candidato a ruta solo si hay que transferirlo a OTRA sucursal
    // de retiro. Si ya está en su sucursal de retiro, está listo para que el cliente lo
    // retire (no se rutea). El destino del envío es la sucursal (address = sucursal).
    const shipments = shipmentsRaw.filter(s =>
        s.deliveryMode !== 'branch_pickup' || (s.pickupBranchId && s.pickupBranchId !== branchId));

    const activeRoutes = await Route.findAll({
        where: {
            transportId: { [Op.in]: transports.map(t => t.id) },
            statusId: { [Op.in]: [RouteStatus.PLANNED, RouteStatus.IN_ROUTE] },
        },
        attributes: ['id', 'transportId', 'statusId'],
    }).catch(() => []);
    const activeRouteByTx = new Map(activeRoutes.map(r => [r.transportId, r]));
    const routeStatusLabel = { [RouteStatus.PLANNED]: 'Planificada · sumable', [RouteStatus.IN_ROUTE]: 'En tránsito' };

    const settingModel = require('../models/setting');
    const piggyRaw = (await settingModel.get('piggyback_enabled')) ?? 'false';
    const piggybackEnabled = piggyRaw === 'true' || piggyRaw === 'on' || piggyRaw === '1';

    for (const t of transports) {
        const ar = activeRouteByTx.get(t.id);
        if (!ar) { t.activeRoute = null; continue; }
        const isInRoute = ar.statusId === RouteStatus.IN_ROUTE;
        // PLANNED + piggyback ON => sumable (no bloquea). IN_ROUTE => siempre bloquea.
        const blocks = isInRoute || (!isInRoute && !piggybackEnabled);
        t.activeRoute = {
            id: ar.id,
            statusId: ar.statusId,
            statusLabel: routeStatusLabel[ar.statusId] || 'Activa',
            blocks,
            piggybackable: !isInRoute && piggybackEnabled,
        };
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
    const strategy = req.body.strategy; // 'price' | 'time' | 'balanced' (el optimizer valida)

    const result = await optimizer.optimizeRoutes({
        shipmentIds, supervisorBranchId: branchId, excludeTransportIds, strategy,
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
    const transport = await transportModel.getById(p.transportId);
    if (!transport) { throw new Error('Transporte no encontrado'); }
    if (!transport.driverUserId) { throw new Error('El transporte no tiene conductor asignado. Asigná un conductor antes de confirmar la ruta.'); }

    // El repartidor puede tener varias rutas PLANIFICADAS en cola, pero solo UNA EN CURSO.
    // Si ya está manejando una (IN_ROUTE), no se le puede asignar otra hasta que la termine;
    // si solo tiene planificadas, la nueva se encola.
    const { Transport } = require('../models/transport');
    const driverTransports = await Transport.findAll({
        where: { driverUserId: transport.driverUserId },
        attributes: ['id'],
        transaction: t,
    });
    const driverTransportIds = driverTransports.map(dt => dt.id);
    if (driverTransportIds.length > 0) {
        const inRoute = await Route.findOne({
            where: {
                transportId: { [Op.in]: driverTransportIds },
                statusId:    RouteStatus.IN_ROUTE,
            },
            attributes: ['id'],
            transaction: t,
        });
        if (inRoute) {
            const driverName = transport.driver?.fullName || `#${transport.driverUserId}`;
            throw new Error(`El repartidor ${driverName} ya está en curso con la ruta #${inRoute.id}. No se le puede asignar otra hasta que la termine (las rutas planificadas sí se pueden encolar).`);
        }
    }

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
    // Retiro por sucursal: para las entregas cuya modalidad es branch_pickup guardamos
    // branchId = sucursal de retiro. Así la parada se distingue como "dejar en sucursal"
    // (al completarla el envío queda en sucursal para retiro, no entregado a domicilio).
    const deliveryShipmentIds = stops.filter(s => s.stopType !== 'pickup' && s.stopType !== 'service' && s.shipmentId).map(s => s.shipmentId);
    const pickupBranchByShipment = new Map();
    if (deliveryShipmentIds.length > 0) {
        const ships = await Shipment.findAll({
            where: { id: { [Op.in]: deliveryShipmentIds }, deliveryMode: 'branch_pickup' },
            attributes: ['id', 'pickupBranchId'],
            transaction: t,
        });
        for (const sh of ships) { pickupBranchByShipment.set(sh.id, sh.pickupBranchId); }
    }
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
                branchId: pickupBranchByShipment.get(s.shipmentId) || null, shipmentId: s.shipmentId,
                lat: s.lat, lng: s.lng,
                distanceFromPrevKm: s.distanceFromPrevKm || 0,
            }, { transaction: t });
        }
    }

    const driverId = transport.driverUserId;
    const driverName = transport.driver?.fullName || null;
    const transportName = transport.name || `#${p.transportId}`;
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
    return { id: route.id, driverId, transportName, stops: shipmentIds.length };
};

// Aviso in-app SOLO al repartidor al que se le asignó la ruta (best-effort, post-commit).
const notifyDriverRouteAssigned = ({ driverId, id, transportName, stops }) => {
    if (!driverId) { return; }
    require('../services/notification/inAppNotifier').notify({
        userId:       driverId,
        event:        'ROUTE_ASSIGNED',
        title:        `Te asignaron la ruta #${id}`,
        body:         `${transportName || 'Transporte'} · ${stops || 0} entrega${stops === 1 ? '' : 's'}`,
        resourceType: 'route',
        resourceId:   id,
        url:          `/route/${id}`,
    }).catch(e => console.error('[route] in-app asignación repartidor:', e.message));
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
        if (!transport.driverUserId) { return res.status(400).json({ error: 'El transporte no tiene conductor asignado. Asigná un conductor antes de confirmar la ruta.' }); }

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
        const result = await sequelize.transaction(t => persistProposal({ p: proposal, branchId, actor, t }));
        res.json({ ok: true, routeId: result.id });
        notifyDriverRouteAssigned(result);
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

    const results = [];
    const actor = res.locals.currentUser || {};
    try {
        await sequelize.transaction(async (t) => {
            for (const p of proposals) {
                const r = await persistProposal({ p, branchId, actor, t });
                results.push(r);
            }
        });
        res.json({ ok: true, routeIds: results.map(r => r.id) });
        results.forEach(notifyDriverRouteAssigned);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
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

    // Cargar historia de cada envio de la ruta (para construir timeline + status final)
    const { ShipmentHistory } = require('../models/shipmentHistory');
    const shipmentIds = (route.stops || [])
        .filter(s => s.stopType === 'delivery' && s.shipmentId)
        .map(s => s.shipmentId);

    let historyByShipment = new Map();
    if (shipmentIds.length > 0) {
        const { Status } = require('../models/status');
        const { User } = require('../models/user');
        const rows = await ShipmentHistory.findAll({
            where: { shipmentId: { [Op.in]: shipmentIds } },
            include: [
                { model: Status, as: 'toStatus',   required: false },
                { model: Status, as: 'fromStatus', required: false },
                { model: User,   as: 'user',       attributes: ['id', 'fullName'], required: false },
            ],
            order: [['changedAt', 'ASC']],
        }).catch(() => []);
        for (const h of rows) {
            const arr = historyByShipment.get(h.shipmentId) || [];
            arr.push(h);
            historyByShipment.set(h.shipmentId, arr);
        }
    }

    // Construir lista de envios con su estado final + datos clave para tabla
    const shipmentsSummary = (route.stops || [])
        .filter(s => s.stopType === 'delivery' && s.shipmentId)
        .map(s => {
            const sh = s.shipment || {};
            const hist = historyByShipment.get(s.shipmentId) || [];
            const lastStatusEvent = [...hist].reverse().find(h => h.toStatus);
            return {
                shipmentId:    s.shipmentId,
                trackingId:    sh.trackingId || ('#' + s.shipmentId),
                recipientName: sh.recipient?.fullName || '—',
                addressLine:   sh.address ? `${sh.address.street || ''} ${sh.address.number || ''}`.trim() : '—',
                statusId:      sh.statusId,
                statusLabel:   lastStatusEvent?.toStatus?.description || '—',
                stopId:        s.id,
                stopSequence:  s.sequence,
                stopCompleted: !!s.completed,
                stopSkipped:   !!s.skipped,
                completedAt:   s.completedAt || null,
            };
        });

    // Timeline global de la ruta: eventos relevantes ordenados
    const STATUS_KEY = (id) => ({1:'pendiente',2:'en_transito',3:'en_sucursal',4:'entregado',5:'cancelado',6:'asignado',7:'en_preparacion',8:'paquete_fallido',9:'intento_fallido'})[id] || 'inicial';
    const STATUS_LABEL = (id) => ({1:'Pendiente',2:'En Tránsito',3:'En Sucursal',4:'Entregado',5:'Cancelado',6:'Asignado',7:'En Preparación',8:'Paquete fallido',9:'Intento fallido'})[id] || `Estado ${id}`;

    const timeline = [];
    // Ruta creada
    timeline.push({ at: route.createdAt, kind: 'route', icon: 'add_circle', label: 'Ruta creada', detail: `Optimización inicial · ${shipmentIds.length} envío(s)`, tone: 'blue' });
    if (route.startedAt) {
        timeline.push({ at: route.startedAt, kind: 'route', icon: 'play_arrow', label: 'Ruta iniciada', detail: 'El repartidor escaneó el QR de salida', tone: 'amber' });
    }
    // Pausas
    for (const p of (route.pauses || [])) {
        if (p.startedAt) {
            timeline.push({ at: p.startedAt, kind: 'pause', icon: 'pause_circle', label: 'Pausa iniciada', detail: p.reason || 'Sin motivo', tone: 'gray' });
        }
        if (p.endedAt) {
            timeline.push({ at: p.endedAt, kind: 'pause', icon: 'play_circle', label: 'Pausa reanudada', detail: '', tone: 'gray' });
        }
    }
    // Eventos por envío
    for (const [shipmentId, rows] of historyByShipment.entries()) {
        const tracking = shipmentsSummary.find(s => s.shipmentId === shipmentId)?.trackingId || `#${shipmentId}`;
        for (const h of rows) {
            // Solo eventos relevantes durante la ruta (descartar CREATED inicial muy antiguo)
            if (h.eventType === 'CREATED') { continue; }
            const isFinal = [4,9,8,5,3].includes(h.toStatusId);
            const tone = h.toStatusId === 4 ? 'green'
                : h.toStatusId === 9 || h.toStatusId === 8 ? 'red'
                : h.toStatusId === 3 ? 'blue'
                : h.toStatusId === 5 ? 'red'
                : h.toStatusId === 2 ? 'amber' : 'gray';
            const icon = h.toStatusId === 4 ? 'check_circle'
                : h.toStatusId === 9 ? 'cancel'
                : h.toStatusId === 8 ? 'broken_image'
                : h.toStatusId === 5 ? 'block'
                : h.toStatusId === 3 ? 'warehouse'
                : h.toStatusId === 2 ? 'local_shipping' : 'autorenew';
            timeline.push({
                at: h.changedAt,
                kind: 'shipment',
                shipmentId,
                tracking,
                icon,
                tone,
                label: STATUS_LABEL(h.toStatusId),
                detail: h.comment || '',
                actor: h.user?.fullName || null,
                eventType: h.eventType,
            });
        }
    }
    if (route.finishedAt) {
        timeline.push({ at: route.finishedAt, kind: 'route', icon: 'flag', label: 'Ruta finalizada', detail: '', tone: 'green' });
    }
    timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

    // KPIs
    const kpis = {
        deliveries:    shipmentsSummary.length,
        delivered:     shipmentsSummary.filter(s => s.statusId === 4).length,
        failed:        shipmentsSummary.filter(s => s.statusId === 9 || s.statusId === 8).length,
        returned:      shipmentsSummary.filter(s => s.statusId === 3).length,
        cancelled:     shipmentsSummary.filter(s => s.statusId === 5).length,
        pending:       shipmentsSummary.filter(s => [1,2,6,7].includes(s.statusId)).length,
        stopsTotal:    (route.stops || []).length,
        stopsDone:     (route.stops || []).filter(s => s.completed).length,
        stopsSkipped:  (route.stops || []).filter(s => s.skipped && !s.completed).length,
    };

    res.render('route/detail', { route, shipmentsSummary, timeline, kpis, STATUS_KEY, STATUS_LABEL });
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

        // Cola: solo se puede tener UNA ruta En Curso a la vez. Si el repartidor ya tiene otra
        // en curso, no puede arrancar esta hasta terminarla (las demás quedan planificadas).
        if (route.statusId === RouteStatus.PLANNED && route.transport?.driverUserId) {
            const { Transport } = require('../models/transport');
            const driverTx = await Transport.findAll({ where: { driverUserId: route.transport.driverUserId }, attributes: ['id'] });
            const otherInRoute = await Route.findOne({
                where: { transportId: { [Op.in]: driverTx.map(tx => tx.id) }, statusId: RouteStatus.IN_ROUTE, id: { [Op.ne]: routeId } },
                attributes: ['id'],
            });
            if (otherInRoute) {
                return res.status(409).render('route/scan', { route, error: `Ya tenés la ruta #${otherInRoute.id} en curso. Terminala antes de empezar esta.`, success: null, summary: null });
            }
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
            if (s.deliveryMode === 'branch_pickup') {
                return res.status(422).json({ error: `Envío ${s.trackingId} es retiro por sucursal; el cliente lo retira en la sucursal, no se rutea a domicilio.` });
            }
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

        // Validar umbrales piggyback configurados en Ajustes
        const settingModel = require('../models/setting');
        const [enabledRaw, pctRaw, kmRaw, costPctRaw] = await Promise.all([
            settingModel.get('piggyback_enabled'),
            settingModel.get('piggyback_max_extra_pct'),
            settingModel.get('piggyback_max_extra_km'),
            settingModel.get('piggyback_max_extra_cost_pct'),
        ]);
        const piggyEnabled = enabledRaw === 'true' || enabledRaw === 'on' || enabledRaw === '1';
        if (!piggyEnabled) {
            return res.status(422).json({ error: 'La opción "Sumar envíos a rutas pendientes" está desactivada en Ajustes. Activarla para permitir esta operación.' });
        }
        const maxExtraPct     = Number(pctRaw)     || 0;
        const maxExtraKm      = Number(kmRaw)      || 0;
        const maxExtraCostPct = Number(costPctRaw) || 0;

        const haversineKm = (a, b) => {
            const toRad = d => d * Math.PI / 180;
            const R = 6371;
            const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
            const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(x));
        };

        const sortedStops = (route.stops || []).sort((a, b) => a.sequence - b.sequence);

        // Mejor inserción (misma estrategia que routeOptimizer.evaluatePiggyback) — minimizar detour.
        // Devuelve { extraKm, insertIdx } donde insertIdx es la posición en el array virtual
        // (igual a stops.length = append al final).
        const computeBestInsertion = (stops, pt) => {
            let bestExtra = Infinity, bestIdx = -1;
            for (let i = 1; i < stops.length; i++) {
                const a = stops[i - 1], b = stops[i];
                const detour = haversineKm(a, pt) + haversineKm(pt, b) - haversineKm(a, b);
                if (detour < bestExtra) { bestExtra = detour; bestIdx = i; }
            }
            const last = stops[stops.length - 1];
            const tailDetour = haversineKm(last, pt);
            if (tailDetour < bestExtra) { bestExtra = tailDetour; bestIdx = stops.length; }
            return { extraKm: bestExtra, insertIdx: bestIdx };
        };

        // Pre-cálculo: planificar inserciones sobre stops virtuales y acumular detour.
        const virtualStops = sortedStops.map(s => ({ lat: num(s.lat), lng: num(s.lng) }));
        const plannedInsertions = []; // { shipment, insertIdx, extraKm }
        let plannedExtraKm = 0;
        for (const s of newShipments) {
            const pt = { lat: num(s.address.lat), lng: num(s.address.lng) };
            const { extraKm: legKm, insertIdx } = computeBestInsertion(virtualStops, pt);
            plannedExtraKm += legKm;
            plannedInsertions.push({ shipment: s, insertIdx, extraKm: legKm, pt });
            virtualStops.splice(insertIdx, 0, pt);
        }

        const baseKm = num(route.totalDistanceKm);
        const baseCost = num(route.totalCost);
        const plannedExtraCost = plannedExtraKm * num(transport.costPerKm);
        const pctExtraKm   = baseKm  > 0 ? (plannedExtraKm   / baseKm)  * 100 : Infinity;
        const pctExtraCost = baseCost > 0 ? (plannedExtraCost / baseCost) * 100 : Infinity;

        if (maxExtraKm > 0 && plannedExtraKm > maxExtraKm) {
            return res.status(422).json({ error: `Desvío absoluto (+${plannedExtraKm.toFixed(1)}km) supera el umbral de ${maxExtraKm}km configurado en Ajustes. No se suma para no penalizar la ruta original.` });
        }
        if (maxExtraPct > 0 && pctExtraKm > maxExtraPct) {
            return res.status(422).json({ error: `Desvío relativo (+${pctExtraKm.toFixed(1)}%) supera el umbral de ${maxExtraPct}% sobre la distancia actual (${baseKm.toFixed(1)}km).` });
        }
        if (maxExtraCostPct > 0 && pctExtraCost > maxExtraCostPct) {
            return res.status(422).json({ error: `Costo extra (+$${plannedExtraCost.toFixed(0)} = ${pctExtraCost.toFixed(1)}%) supera el umbral de ${maxExtraCostPct}% sobre el costo actual ($${baseCost.toFixed(0)}).` });
        }

        let extraKm = plannedExtraKm;
        const transaction = await sequelize.transaction();
        try {
            // Mapa sequence → row id para shift en BD. Insertamos en orden de mayor a menor insertIdx
            // para evitar conflictos de unicidad si hubiera índice (sequence, routeId).
            const liveStops = [...sortedStops];
            for (const ins of plannedInsertions) {
                // Sequence destino: si insertIdx === liveStops.length, append; sino, ocupa la sequence del stop en esa posición y desplaza posteriores.
                const targetSeq = ins.insertIdx >= liveStops.length
                    ? (liveStops[liveStops.length - 1].sequence || liveStops.length) + 1
                    : liveStops[ins.insertIdx].sequence;

                if (ins.insertIdx < liveStops.length) {
                    // Shift: aumentar +1 todas las sequences >= targetSeq (workaround: pasar a negativas y luego al valor final, para evitar colisiones si hay UNIQUE).
                    const toShift = liveStops.slice(ins.insertIdx);
                    for (const st of toShift) {
                        await RouteStop.update(
                            { sequence: -(st.sequence + 1) },
                            { where: { id: st.id }, transaction }
                        );
                    }
                    for (const st of toShift) {
                        await RouteStop.update(
                            { sequence: st.sequence + 1 },
                            { where: { id: st.id }, transaction }
                        );
                        st.sequence += 1;
                    }
                }

                const created = await RouteStop.create({
                    routeId, sequence: targetSeq, stopType: 'delivery',
                    branchId: null, shipmentId: ins.shipment.id,
                    lat: ins.pt.lat, lng: ins.pt.lng,
                    distanceFromPrevKm: Number(ins.extraKm.toFixed(2)),
                }, { transaction });

                liveStops.splice(ins.insertIdx, 0, {
                    id: created.id, sequence: targetSeq,
                    lat: ins.pt.lat, lng: ins.pt.lng,
                });
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
