'use strict';

const { Op } = require('sequelize');
const {
    Shipment, Person, Status,
    Route, Transport, User, Branch,
    Incident, IncidentType,
} = require('../models/index');
const incidentModel = require('../models/incident');
const modificationModel = require('../models/shipmentModificationRequest');

const RouteStatus = Object.freeze({
    PLANNED: 1, IN_ROUTE: 2, FINISHED: 3, CANCELLED: 4,
    INTERRUPTED: 5, BLOCKED_FATIGUE: 6, PAUSED_FATIGUE: 7,
});
const { RoleType, ModificationRequestStatus } = require('../constants/enums');
const statusColors = require('../services/statusColors');

const slugOf = statusColors.slugOf;

const normalizeSlug = (text) =>
    slugOf(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const LIMIT = 6;
const FETCH_LIMIT = LIMIT + 1;
const isNum = (s) => /^\d{1,9}$/.test(s.trim());
const asRole = (roleId) => Number(roleId);

const EMPTY_META = Object.freeze({
    shipments: { hasMore: false },
    incidents: { hasMore: false },
    routes: { hasMore: false },
    returns: { hasMore: false },
    users: { hasMore: false },
    modifications: { hasMore: false },
    portalClients: { hasMore: false },
});

const sliceWithMeta = (items) => {
    const list = items || [];
    return {
        items: list.slice(0, LIMIT),
        hasMore: list.length > LIMIT,
    };
};

const isStaffReviewer = (role) =>
    role === RoleType.SUPERVISOR.id
    || role === RoleType.OPERATOR.id
    || role === RoleType.ADMIN.id;

/** Filtros de incidencias alineados con incidentModel.list / incidentVisibleTo. */
const buildIncidentFilters = (roleId, userId, branchId, q, numeric) => {
    const role = asRole(roleId);
    const filters = { limit: FETCH_LIMIT };
    if (numeric) {
        filters.id = parseInt(q, 10);
    } else {
        filters.trackingId = q;
    }

    if (role === RoleType.DELIVERY.id) {
        filters.deliveryUserId = Number(userId);
    } else if (role === RoleType.SUPERVISOR.id || role === RoleType.OPERATOR.id) {
        filters.staffScope = { branchId: branchId || null, userId: Number(userId) };
    } else if (role !== RoleType.ADMIN.id) {
        filters.id = -1;
    }
    return filters;
};

const INCIDENT_STATUS_LABEL = { OPEN: 'Abierta', IN_REVIEW: 'En revisión', CLOSED: 'Cerrada' };
const ROLE_LABEL = { 1: 'Supervisor', 2: 'Operador', 3: 'Repartidor', 4: 'Administrador' };
const MOD_STATUS_LABEL = {
    [ModificationRequestStatus.PENDING_REVIEW]: 'Pendiente',
    [ModificationRequestStatus.APPLIED]: 'Aplicada',
    [ModificationRequestStatus.REJECTED]: 'Rechazada',
};
const ROUTE_STATUS_LABEL = {
    [RouteStatus.PLANNED]:         'Planificada',
    [RouteStatus.IN_ROUTE]:        'En curso',
    [RouteStatus.FINISHED]:        'Finalizada',
    [RouteStatus.CANCELLED]:       'Cancelada',
    [RouteStatus.INTERRUPTED]:     'Interrumpida',
    [RouteStatus.BLOCKED_FATIGUE]: 'Bloqueada (fatiga)',
    [RouteStatus.PAUSED_FATIGUE]:  'Pausada (fatiga)',
};

const ROUTE_STATUS_SLUG = {
    [RouteStatus.PLANNED]:         'planificada',
    [RouteStatus.IN_ROUTE]:        'en_curso',
    [RouteStatus.FINISHED]:        'finalizada',
    [RouteStatus.CANCELLED]:       'cancelada',
    [RouteStatus.INTERRUPTED]:     'interrumpida',
    [RouteStatus.BLOCKED_FATIGUE]: 'cancelado',
    [RouteStatus.PAUSED_FATIGUE]:  'retrasado',
};

const MOD_STATUS_SLUG = {
    [ModificationRequestStatus.PENDING_REVIEW]: 'pendiente',
    [ModificationRequestStatus.APPLIED]: 'aplicada',
    [ModificationRequestStatus.REJECTED]: 'rechazada',
};

const SHIPMENT_MATCH_LABELS = {
    tracking: 'Tracking',
    legacy: 'Tracking legacy',
    sender: 'Remitente',
    recipient: 'Destinatario',
};

const INCIDENT_MATCH_LABELS = {
    id: 'Nº incidencia',
    tracking: 'Tracking del envío',
    type: 'Tipo de incidencia',
};

const MOD_MATCH_LABELS = {
    id: 'Nº solicitud',
    tracking: 'Tracking',
    recipient: 'Destinatario',
    email: 'Email solicitante',
    document: 'Documento solicitante',
};

const MOD_CHANGE_LABELS = {
    ADDRESS_CHANGE: 'Cambio de dirección',
    RECIPIENT_CHANGE: 'Cambio de destinatario',
    DELIVERY_DATE_CHANGE: 'Cambio de fecha',
    CANCEL_REQUEST: 'Cancelación',
};

const mergeShipments = (byT, byL, byS, byR) => {
    const trackingIds = new Set(byT.map((s) => s.id));
    const legacyIds = new Set(byL.map((s) => s.id));
    const senderIds = new Set(byS.map((s) => s.id));
    const recipientIds = new Set(byR.map((s) => s.id));
    const seen = new Set();
    const merged = [];
    for (const s of [...byT, ...byL, ...byS, ...byR]) {
        if (seen.has(s.id)) { continue; }
        seen.add(s.id);
        let matchedBy = 'tracking';
        if (trackingIds.has(s.id)) { matchedBy = 'tracking'; }
        else if (legacyIds.has(s.id)) { matchedBy = 'legacy'; }
        else if (senderIds.has(s.id)) { matchedBy = 'sender'; }
        else if (recipientIds.has(s.id)) { matchedBy = 'recipient'; }
        merged.push({ row: s, matchedBy });
    }
    return merged;
};

const formatShipmentHit = ({ row: s, matchedBy }) => {
    const senderName = s.sender?.fullName || null;
    const recipientName = s.recipient?.fullName || null;
    const status = s.status?.description || null;
    let matchValue = null;
    if (matchedBy === 'tracking') { matchValue = s.trackingId || null; }
    else if (matchedBy === 'legacy') { matchValue = s.legacyTrackingId || null; }
    else if (matchedBy === 'sender') { matchValue = senderName; }
    else if (matchedBy === 'recipient') { matchValue = recipientName; }

    return {
        id: s.id,
        trackingId: s.trackingId,
        legacyTrackingId: s.legacyTrackingId || null,
        senderName,
        recipientName,
        status,
        statusSlug: status ? normalizeSlug(status) : null,
        matchedBy,
        matchLabel: SHIPMENT_MATCH_LABELS[matchedBy] || null,
        matchValue,
        secondary: [
            senderName && recipientName ? `${senderName} → ${recipientName}` : (recipientName || senderName),
            status,
            matchedBy === 'legacy' ? `Legacy: ${s.legacyTrackingId}` : null,
        ].filter(Boolean).join(' · '),
    };
};

const matchDriverRoute = (route, q, numeric) => {
    const qLower = q.toLowerCase();
    const routeId = Number(route.id);
    if (numeric && routeId === parseInt(q, 10)) { return true; }
    if (String(routeId).includes(q)) { return true; }
    const transportName = route.transport?.name || '';
    const branchName = route.originBranch?.name || '';
    return transportName.toLowerCase().includes(qLower)
        || branchName.toLowerCase().includes(qLower);
};

const fetchDriverRoutes = (userId) => Route.findAll({
    include: [
        {
            model: Transport, as: 'transport', required: true,
            where: { driverUserId: Number(userId) },
            attributes: ['id', 'name', 'driverUserId'],
        },
        { model: Branch, as: 'originBranch', required: false, attributes: ['name'] },
    ],
    attributes: ['id', 'statusId'],
    order: [['id', 'DESC']],
    limit: 100,
});

const buildShipmentScope = (role, uid, branchId) => {
    const scopeFilter = {};
    if (role === RoleType.DELIVERY.id) {
        scopeFilter.deliveryUserId = uid;
    } else if ((role === RoleType.SUPERVISOR.id || role === RoleType.OPERATOR.id) && branchId) {
        scopeFilter.currentBranchId = branchId;
    }
    return scopeFilter;
};

const buildRouteScope = (role, branchId) => {
    if (role === RoleType.ADMIN.id) { return {}; }
    if (branchId) { return { originBranchId: branchId }; }
    return {};
};

/** Incidencias cuyo tipo coincide con la descripción (además de tracking/id). */
const searchIncidentsByType = (role, uid, branchId, q) => {
    const like = { [Op.iLike]: `%${q}%` };
    const where = {};
    const shipmentInclude = {
        model: Shipment, as: 'shipment', required: true,
        attributes: ['id', 'trackingId', 'deliveryUserId', 'currentBranchId'],
    };

    if (role === RoleType.DELIVERY.id) {
        shipmentInclude.where = { deliveryUserId: uid };
        shipmentInclude.required = true;
    } else if (role === RoleType.SUPERVISOR.id || role === RoleType.OPERATOR.id) {
        const orClauses = [];
        if (branchId) {
            orClauses.push({ '$shipment.currentBranchId$': branchId });
            orClauses.push({ '$assignedTo.branchId$': branchId });
        }
        orClauses.push({ assignedToUserId: uid }, { openedByUserId: uid });
        if (orClauses.length > 0) {
            where[Op.and] = [{ [Op.or]: orClauses }];
        } else {
            where.id = -1;
        }
    } else if (role !== RoleType.ADMIN.id) {
        where.id = -1;
    }

    return Incident.findAll({
        where,
        include: [
            shipmentInclude,
            {
                model: IncidentType, as: 'type', required: true,
                where: { description: like },
                attributes: ['code', 'description'],
            },
            { model: User, as: 'assignedTo', attributes: ['id', 'branchId'], required: false },
        ],
        attributes: ['id', 'status', 'shipmentId'],
        order: [['id', 'DESC']],
        limit: FETCH_LIMIT,
        subQuery: false,
    }).catch(() => []);
};

const mergeIncidents = (fromList, fromType, numeric) => {
    const seen = new Set();
    const merged = [];
    const add = (row, matchedBy, matchValue) => {
        if (!row || seen.has(row.id)) { return; }
        if (row.type?.code === 'RETURN') { return; }
        seen.add(row.id);
        merged.push({ row, matchedBy, matchValue: matchValue || null });
    };
    for (const i of fromList) {
        add(i, numeric ? 'id' : 'tracking', numeric ? String(i.id) : (i.shipment?.trackingId || null));
    }
    for (const i of fromType) {
        add(i, 'type', i.type?.description || null);
    }
    return merged;
};

const inferModificationMatch = (m, q) => {
    const trimmed = String(q).trim();
    const ql = trimmed.toLowerCase();
    if (m.shipment?.trackingId && m.shipment.trackingId.toLowerCase().includes(ql)) {
        return { matchedBy: 'tracking', matchValue: m.shipment.trackingId };
    }
    if (m.shipment?.recipient?.fullName && m.shipment.recipient.fullName.toLowerCase().includes(ql)) {
        return { matchedBy: 'recipient', matchValue: m.shipment.recipient.fullName };
    }
    if (m.requestedByEmail && m.requestedByEmail.toLowerCase().includes(ql)) {
        return { matchedBy: 'email', matchValue: m.requestedByEmail };
    }
    if (/^\d{1,9}$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        if (m.id === n) { return { matchedBy: 'id', matchValue: String(m.id) }; }
        if (m.requestedByDocument === n) {
            return { matchedBy: 'document', matchValue: String(m.requestedByDocument) };
        }
    }
    return { matchedBy: null, matchValue: null };
};

const personMatchWhere = (q, like, numeric) => {
    const orClauses = [{ fullName: like }, { email: like }];
    if (numeric) { orClauses.push({ document: parseInt(q, 10) }); }
    return { [Op.or]: orClauses };
};

const portalClientKey = (document, email) =>
    `${document}:${String(email || '').trim().toLowerCase()}`;

const aggregatePortalClients = (senderRows, recipientRows) => {
    const map = new Map();
    const add = (person, matchAs) => {
        if (!person?.document) { return; }
        const key = portalClientKey(person.document, person.email);
        if (!map.has(key)) {
            map.set(key, {
                document: person.document,
                email: person.email || '',
                fullName: person.fullName || '',
                shipmentCount: 0,
                matchAs,
            });
        }
        const entry = map.get(key);
        entry.shipmentCount += 1;
    };
    for (const row of senderRows) { add(row.sender, 'sender'); }
    for (const row of recipientRows) { add(row.recipient, 'recipient'); }
    return Array.from(map.values());
};

const searchPortalClients = (scopeFilter, q, like, numeric) => {
    const personWhere = personMatchWhere(q, like, numeric);
    const attrs = ['id'];
    const personAttrs = ['document', 'email', 'fullName'];

    const bySender = Shipment.findAll({
        where: scopeFilter,
        attributes: attrs,
        include: [{
            model: Person, as: 'sender', required: true,
            where: personWhere, attributes: personAttrs,
        }],
        limit: FETCH_LIMIT * 3,
    }).catch(() => []);

    const byRecipient = Shipment.findAll({
        where: scopeFilter,
        attributes: attrs,
        include: [{
            model: Person, as: 'recipient', required: true,
            where: personWhere, attributes: personAttrs,
        }],
        limit: FETCH_LIMIT * 3,
    }).catch(() => []);

    return Promise.all([bySender, byRecipient]).then(([senders, recipients]) =>
        aggregatePortalClients(senders, recipients)
    );
};

const searchStaffRoutes = (routeScope, like, numeric, q) => {
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
        limit: FETCH_LIMIT,
    }).catch(() => []);

    const rById = numeric
        ? Route.findOne({
            where: { ...routeScope, id: parseInt(q, 10) },
            include: routeIncludes,
            attributes: ['id', 'statusId'],
        }).catch(() => null)
        : Promise.resolve(null);

    return Promise.all([rById, rByDriver]).then(([byId, byDriver]) => {
        const merged = [...byDriver];
        if (byId && !merged.find(r => r.id === byId.id)) { merged.unshift(byId); }
        return merged;
    });
};

const search = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.json({
                shipments: [], incidents: [], routes: [], returns: [], users: [],
                modifications: [], portalClients: [],
                meta: { ...EMPTY_META },
            });
        }

        const { roleId, id: userId, branchId } = res.locals.currentUser;
        const role = asRole(roleId);
        const uid = Number(userId);
        const like = { [Op.iLike]: `%${q}%` };
        const numeric = isNum(q);
        const scopeFilter = buildShipmentScope(role, uid, branchId);

        const shipIncludes = (senderReq, recipientReq) => [
            { model: Person, as: 'sender', required: senderReq, attributes: ['fullName'], ...(senderReq ? { where: { fullName: like } } : {}) },
            { model: Person, as: 'recipient', required: recipientReq, attributes: ['fullName'], ...(recipientReq ? { where: { fullName: like } } : {}) },
            { model: Status, as: 'status', required: false, attributes: ['description'] },
        ];

        const shipOpts = (inc) => ({
            include: inc,
            attributes: ['id', 'trackingId', 'legacyTrackingId'],
            order: [['id', 'DESC']],
            limit: FETCH_LIMIT,
        });

        const shipByTrackingP = Shipment.findAll({ where: { ...scopeFilter, trackingId: like }, ...shipOpts(shipIncludes(false, false)) }).catch(() => []);
        const shipByLegacyP = Shipment.findAll({ where: { ...scopeFilter, legacyTrackingId: like }, ...shipOpts(shipIncludes(false, false)) }).catch(() => []);
        const shipBySenderP = Shipment.findAll({ where: scopeFilter, ...shipOpts(shipIncludes(true, false)) }).catch(() => []);
        const shipByRecipientP = Shipment.findAll({ where: scopeFilter, ...shipOpts(shipIncludes(false, true)) }).catch(() => []);

        const shipmentsPromise = Promise.all([shipByTrackingP, shipByLegacyP, shipBySenderP, shipByRecipientP])
            .then(([byT, byL, byS, byR]) => mergeShipments(byT, byL, byS, byR));

        const incidentsFromListP = incidentModel.list(
            buildIncidentFilters(role, uid, branchId, q, numeric)
        ).catch(() => []);

        const incidentsFromTypeP = (!numeric)
            ? searchIncidentsByType(role, uid, branchId, q)
            : Promise.resolve([]);

        const incidentsPromise = Promise.all([incidentsFromListP, incidentsFromTypeP])
            .then(([fromList, fromType]) => mergeIncidents(fromList, fromType, numeric));

        let routesPromise = Promise.resolve([]);
        if (role === RoleType.DELIVERY.id) {
            routesPromise = fetchDriverRoutes(uid)
                .then(routes => routes.filter(r => matchDriverRoute(r, q, numeric)))
                .catch((err) => {
                    console.error('[search] delivery routes:', err.message);
                    return [];
                });
        } else if (role === RoleType.SUPERVISOR.id || role === RoleType.OPERATOR.id || role === RoleType.ADMIN.id) {
            routesPromise = searchStaffRoutes(buildRouteScope(role, branchId), like, numeric, q);
        }

        let returnsPromise = Promise.resolve([]);
        if (role === RoleType.SUPERVISOR.id || role === RoleType.ADMIN.id) {
            const retShipmentWhere = { trackingId: like };
            if (role === RoleType.SUPERVISOR.id && branchId) {
                retShipmentWhere.currentBranchId = branchId;
            }
            returnsPromise = Incident.findAll({
                include: [
                    {
                        model: Shipment, as: 'shipment', required: true,
                        where: retShipmentWhere, attributes: ['id', 'trackingId'],
                    },
                    {
                        model: IncidentType, as: 'type', required: true,
                        where: { code: 'RETURN' }, attributes: ['code'],
                    },
                ],
                attributes: ['id', 'status', 'shipmentId'],
                order: [['id', 'DESC']],
                limit: FETCH_LIMIT,
            }).catch(() => []);
        }

        let usersPromise = Promise.resolve([]);
        if (role === RoleType.ADMIN.id) {
            const userWhere = { active: true };
            if (numeric) {
                userWhere[Op.or] = [{ fullName: like }, { document: parseInt(q, 10) }, { email: like }];
            } else {
                userWhere[Op.or] = [{ fullName: like }, { email: like }];
            }
            usersPromise = User.findAll({
                where: userWhere,
                attributes: ['id', 'fullName', 'roleId', 'email'],
                order: [['fullName', 'ASC']],
                limit: FETCH_LIMIT,
            }).catch(() => []);
        }

        let modificationsPromise = Promise.resolve([]);
        let portalClientsPromise = Promise.resolve([]);
        if (isStaffReviewer(role)) {
            const modBranchId = role === RoleType.ADMIN.id ? null : (branchId || null);
            modificationsPromise = modificationModel.searchForUniversal({
                q, branchId: modBranchId, fetchLimit: FETCH_LIMIT,
            }).catch(() => []);

            portalClientsPromise = searchPortalClients(scopeFilter, q, like, numeric);
        }

        const [
            shipmentsMerged, incidentsRaw, routesRaw, returnsRaw, usersRaw,
            modificationsRaw, portalClientsRaw,
        ] = await Promise.all([
            shipmentsPromise, incidentsPromise, routesPromise, returnsPromise, usersPromise,
            modificationsPromise, portalClientsPromise,
        ]);

        const shipmentsSlice = sliceWithMeta(shipmentsMerged);
        const incidentsSlice = sliceWithMeta(incidentsRaw);
        const routesSlice = sliceWithMeta(routesRaw);
        const returnsSlice = sliceWithMeta(returnsRaw);
        const usersSlice = sliceWithMeta(usersRaw);
        const modificationsSlice = sliceWithMeta(modificationsRaw);
        const portalClientsSlice = sliceWithMeta(portalClientsRaw);

        return res.json({
            shipments: shipmentsSlice.items.map(formatShipmentHit),
            incidents: incidentsSlice.items.filter(Boolean).map(({ row: i, matchedBy, matchValue }) => {
                const statusCode = String(i.status || '').toLowerCase();
                const status = INCIDENT_STATUS_LABEL[i.status] || i.status;
                return {
                    id: i.id,
                    trackingId: i.shipment?.trackingId || null,
                    type: i.type?.description || null,
                    status,
                    statusCode,
                    matchedBy,
                    matchLabel: INCIDENT_MATCH_LABELS[matchedBy] || null,
                    matchValue,
                };
            }),
            routes: routesSlice.items.filter(Boolean).map((r) => {
                const status = ROUTE_STATUS_LABEL[r.statusId] || null;
                return {
                    id: r.id,
                    driverName: r.transport?.driver?.fullName || null,
                    transportName: r.transport?.name || null,
                    branchName: r.originBranch?.name || null,
                    status,
                    statusSlug: ROUTE_STATUS_SLUG[r.statusId] || null,
                };
            }),
            returns: returnsSlice.items.filter(Boolean).map((r) => {
                const statusCode = String(r.status || '').toLowerCase();
                const status = INCIDENT_STATUS_LABEL[r.status] || r.status;
                return {
                    id: r.id,
                    trackingId: r.shipment?.trackingId || null,
                    status,
                    statusCode,
                    matchLabel: 'Tracking del envío',
                    matchValue: r.shipment?.trackingId || null,
                };
            }),
            users: usersSlice.items.filter(Boolean).map((u) => ({
                id: u.id,
                fullName: u.fullName,
                role: ROLE_LABEL[u.roleId] || 'Desconocido',
                email: u.email || null,
            })),
            modifications: modificationsSlice.items.filter(Boolean).map((m) => {
                const modStatus = MOD_STATUS_LABEL[m.status] || m.status;
                const { matchedBy, matchValue } = inferModificationMatch(m, q);
                return {
                    id: m.id,
                    shipmentId: m.shipmentId,
                    trackingId: m.shipment?.trackingId || null,
                    changeType: MOD_CHANGE_LABELS[m.changeType] || m.changeType,
                    status: modStatus,
                    statusSlug: MOD_STATUS_SLUG[m.status] || (modStatus ? normalizeSlug(modStatus) : null),
                    recipientName: m.shipment?.recipient?.fullName || null,
                    matchedBy,
                    matchLabel: MOD_MATCH_LABELS[matchedBy] || null,
                    matchValue,
                };
            }),
            portalClients: portalClientsSlice.items.map((c) => ({
                document: c.document,
                email: c.email,
                fullName: c.fullName,
                shipmentCount: c.shipmentCount,
                matchAs: c.matchAs,
                matchLabel: c.matchAs === 'sender' ? 'Remitente' : 'Destinatario',
                matchValue: c.fullName || String(c.document),
            })),
            meta: {
                shipments: { hasMore: shipmentsSlice.hasMore },
                incidents: { hasMore: incidentsSlice.hasMore },
                routes: { hasMore: routesSlice.hasMore },
                returns: { hasMore: returnsSlice.hasMore },
                users: { hasMore: usersSlice.hasMore },
                modifications: { hasMore: modificationsSlice.hasMore },
                portalClients: { hasMore: portalClientsSlice.hasMore },
            },
        });
    } catch (err) {
        console.error('[search] error:', err.message);
        return res.status(500).json({ error: 'Error en la búsqueda' });
    }
};

module.exports = { search };
