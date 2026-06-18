'use strict';

const { Op } = require('sequelize');
const {
    Shipment, Person, Status,
    Incident, IncidentType,
    Route, Transport, User,
    ShipmentReturn,
} = require('../models/index');
const { RoleType } = require('../constants/enums');

const LIMIT = 4;
const isNum = (s) => /^\d{1,9}$/.test(s.trim());

const INCIDENT_STATUS_LABEL = { OPEN: 'Abierta', IN_REVIEW: 'En revisión', CLOSED: 'Cerrada' };
const RETURN_STATUS_LABEL   = { SOLICITADA: 'Solicitada', EN_REVISION: 'En revisión', RESUELTA: 'Resuelta', RECHAZADA: 'Rechazada' };
const ROLE_LABEL             = { 1: 'Supervisor', 2: 'Operador', 3: 'Repartidor', 4: 'Administrador' };

const search = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.json({ shipments: [], incidents: [], routes: [], returns: [], users: [] });
        }

        const { roleId, id: userId, branchId } = res.locals.currentUser;
        const like = { [Op.iLike]: `%${q}%` };
        const numeric = isNum(q);

        // ── Shipments (todos los roles) ──────────────────────────────────────
        const scopeFilter = {};
        if (roleId === RoleType.DELIVERY.id) {
            scopeFilter.deliveryUserId = userId;
        } else if ((roleId === RoleType.SUPERVISOR.id || roleId === RoleType.OPERATOR.id) && branchId) {
            scopeFilter.currentBranchId = branchId;
        }

        const shipIncludes = (senderReq, recipientReq) => [
            { model: Person, as: 'sender',    required: senderReq,    attributes: ['fullName'], ...(senderReq    ? { where: { fullName: like } } : {}) },
            { model: Person, as: 'recipient', required: recipientReq, attributes: ['fullName'], ...(recipientReq ? { where: { fullName: like } } : {}) },
            { model: Status, as: 'status',    required: false,         attributes: ['description'] },
        ];

        const shipOpts = (inc) => ({
            include: inc,
            attributes: ['id', 'trackingId'],
            order: [['id', 'DESC']],
            limit: LIMIT,
        });

        const shipByTrackingP  = Shipment.findAll({ where: { ...scopeFilter, trackingId: like }, ...shipOpts(shipIncludes(false, false)) }).catch(() => []);
        const shipBySenderP    = Shipment.findAll({ where: scopeFilter, ...shipOpts(shipIncludes(true,  false)) }).catch(() => []);
        const shipByRecipientP = Shipment.findAll({ where: scopeFilter, ...shipOpts(shipIncludes(false, true))  }).catch(() => []);

        const shipmentsPromise = Promise.all([shipByTrackingP, shipBySenderP, shipByRecipientP]).then(([byT, byS, byR]) => {
            const seen = new Set();
            const merged = [];
            for (const s of [...byT, ...byS, ...byR]) {
                if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
            }
            return merged.slice(0, LIMIT);
        });

        // ── Incidents (todos los roles) ──────────────────────────────────────
        const incShipmentWhere = { trackingId: like };
        if ((roleId === RoleType.SUPERVISOR.id || roleId === RoleType.OPERATOR.id) && branchId) {
            incShipmentWhere.currentBranchId = branchId;
        }
        const incidentWhere = roleId === RoleType.DELIVERY.id ? { openedByUserId: userId } : {};

        const incByTrackingPromise = Incident.findAll({
            where: incidentWhere,
            include: [
                { model: Shipment, as: 'shipment', required: true, where: incShipmentWhere, attributes: ['id', 'trackingId'] },
                { model: IncidentType, as: 'type', required: false, attributes: ['description'] },
            ],
            attributes: ['id', 'status', 'shipmentId'],
            order: [['id', 'DESC']],
            limit: LIMIT,
        }).catch(() => []);

        const incByIdPromise = numeric
            ? Incident.findOne({
                where: { id: parseInt(q), ...incidentWhere },
                include: [
                    { model: Shipment, as: 'shipment', required: false, attributes: ['id', 'trackingId'] },
                    { model: IncidentType, as: 'type', required: false, attributes: ['description'] },
                ],
                attributes: ['id', 'status', 'shipmentId'],
            }).catch(() => null)
            : Promise.resolve(null);

        const incidentsPromise = Promise.all([incByTrackingPromise, incByIdPromise]).then(([byTracking, byId]) => {
            const merged = [...byTracking];
            if (byId && !merged.find(r => r.id === byId.id)) merged.unshift(byId);
            return merged.slice(0, LIMIT);
        });

        // ── Routes (Supervisor + Admin) ──────────────────────────────────────
        let routesPromise = Promise.resolve([]);
        if (roleId === RoleType.SUPERVISOR.id || roleId === RoleType.ADMIN.id) {
            const routeScope = (roleId === RoleType.SUPERVISOR.id && branchId) ? { originBranchId: branchId } : {};
            const routeIncludes = [
                {
                    model: Transport, as: 'transport', required: false,
                    include: [{ model: User, as: 'driver', required: false, attributes: ['id', 'fullName'] }],
                },
                { model: Status, as: 'status', required: false, attributes: ['description'] },
            ];
            const byDriverIncludes = [
                {
                    model: Transport, as: 'transport', required: true,
                    include: [{ model: User, as: 'driver', required: true, where: { fullName: like }, attributes: ['id', 'fullName'] }],
                },
                { model: Status, as: 'status', required: false, attributes: ['description'] },
            ];

            const rByDriver = Route.findAll({
                where: routeScope,
                include: byDriverIncludes,
                attributes: ['id', 'statusId'],
                order: [['id', 'DESC']],
                limit: LIMIT,
            }).catch(() => []);

            const rById = numeric
                ? Route.findOne({ where: { ...routeScope, id: parseInt(q) }, include: routeIncludes, attributes: ['id', 'statusId'] }).catch(() => null)
                : Promise.resolve(null);

            routesPromise = Promise.all([rById, rByDriver]).then(([byId, byDriver]) => {
                const merged = [...byDriver];
                if (byId && !merged.find(r => r.id === byId.id)) merged.unshift(byId);
                return merged.slice(0, LIMIT);
            });
        }

        // ── Returns (Supervisor + Admin) ─────────────────────────────────────
        let returnsPromise = Promise.resolve([]);
        if (roleId === RoleType.SUPERVISOR.id || roleId === RoleType.ADMIN.id) {
            const retShipmentWhere = { trackingId: like };
            if (roleId === RoleType.SUPERVISOR.id && branchId) retShipmentWhere.currentBranchId = branchId;
            returnsPromise = ShipmentReturn.findAll({
                include: [
                    { model: Shipment, as: 'shipment', required: true, where: retShipmentWhere, attributes: ['id', 'trackingId'] },
                ],
                attributes: ['id', 'status', 'shipmentId'],
                order: [['id', 'DESC']],
                limit: LIMIT,
            }).catch(() => []);
        }

        // ── Users (solo Admin) ────────────────────────────────────────────────
        let usersPromise = Promise.resolve([]);
        if (roleId === RoleType.ADMIN.id) {
            const userWhere = { active: true };
            if (numeric) {
                userWhere[Op.or] = [{ fullName: like }, { document: parseInt(q) }];
            } else {
                userWhere.fullName = like;
            }
            usersPromise = User.findAll({
                where: userWhere,
                attributes: ['id', 'fullName', 'roleId'],
                order: [['fullName', 'ASC']],
                limit: LIMIT,
            }).catch(() => []);
        }

        const [shipmentsRaw, incidentsRaw, routesRaw, returnsRaw, usersRaw] = await Promise.all([
            shipmentsPromise, incidentsPromise, routesPromise, returnsPromise, usersPromise,
        ]);

        return res.json({
            shipments: shipmentsRaw.map(s => ({
                id:            s.id,
                trackingId:    s.trackingId,
                recipientName: s.recipient?.fullName || s.sender?.fullName || null,
                status:        s.status?.description || null,
            })),
            incidents: incidentsRaw.filter(Boolean).map(i => ({
                id:        i.id,
                trackingId: i.shipment?.trackingId || null,
                type:      i.type?.description || null,
                status:    INCIDENT_STATUS_LABEL[i.status] || i.status,
            })),
            routes: routesRaw.filter(Boolean).map(r => ({
                id:         r.id,
                driverName: r.transport?.driver?.fullName || null,
                status:     r.status?.description || null,
            })),
            returns: returnsRaw.filter(Boolean).map(r => ({
                id:        r.id,
                trackingId: r.shipment?.trackingId || null,
                status:    RETURN_STATUS_LABEL[r.status] || r.status,
            })),
            users: usersRaw.filter(Boolean).map(u => ({
                id:       u.id,
                fullName: u.fullName,
                role:     ROLE_LABEL[u.roleId] || 'Desconocido',
            })),
        });
    } catch (err) {
        console.error('[search] error:', err.message);
        return res.status(500).json({ error: 'Error en la búsqueda' });
    }
};

module.exports = { search };
