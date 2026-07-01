// Panel de supervisión: incidentes en ruta (RouteIncident) reportados por repartidores.
// Accesible para supervisores y administradores. El supervisor ve incidentes de rutas
// que salieron de SU sucursal; el admin ve todo.
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { requireSupervisorOrAdmin } = require('../middlewares/auth');
const { RouteIncident } = require('../models/routeIncident');
const { Route } = require('../models/route');
const { User } = require('../models/user');
const { Branch } = require('../models/branch');
const { RoleType } = require('../constants/enums');

const INCIDENT_TYPE_LABELS = {
    vehicular: 'Problema vehicular',
    accidente: 'Accidente',
    trafico:   'Tráfico severo',
    clima:     'Clima adverso',
    otro:      'Otro',
};
const SEVERITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };

const _scopeBranchIds = async (currentUser) => {
    // Admin: sin filtro. Supervisor: solo rutas de SU sucursal.
    if (currentUser.roleId === RoleType.ADMIN.id) { return null; }
    return currentUser.branchId ? [currentUser.branchId] : [];
};

router.get('/route-incidents', requireSupervisorOrAdmin, async (req, res) => {
    const { severity, incidentType, resolved } = req.query;
    const branchIds = await _scopeBranchIds(res.locals.currentUser);

    const routeWhere = {};
    if (branchIds !== null) {
        if (branchIds.length === 0) {
            return res.render('supervision/routeIncidents', {
                items: [], totalOpen: 0, filters: { severity, incidentType, resolved },
                labels: { types: INCIDENT_TYPE_LABELS, severities: SEVERITY_LABELS },
                currentUser: res.locals.currentUser,
            });
        }
        routeWhere.originBranchId = { [Op.in]: branchIds };
    }

    const incWhere = {};
    if (severity && SEVERITY_LABELS[severity]) { incWhere.severity = severity; }
    if (incidentType && INCIDENT_TYPE_LABELS[incidentType]) { incWhere.incidentType = incidentType; }
    if (resolved === '1') { incWhere.resolvedAt = { [Op.ne]: null }; }
    else if (resolved === '0' || !resolved) { incWhere.resolvedAt = null; }

    const rows = await RouteIncident.findAll({
        where: incWhere,
        order: [['reportedAt', 'DESC']],
        limit: 200,
    });

    // Enrich con ruta / driver / branch (queries livianas por-lote).
    const routeIds = [...new Set(rows.map(r => r.routeId))];
    const userIds  = [...new Set(rows.map(r => r.userId))];
    const routes = routeIds.length
        ? await Route.findAll({ where: { id: { [Op.in]: routeIds }, ...routeWhere }, attributes: ['id', 'originBranchId'] })
        : [];
    const routeById = new Map(routes.map(r => [r.id, r]));
    // Filtro final por scope (por si algún RouteIncident refiere a ruta fuera del scope).
    const filtered = branchIds === null
        ? rows
        : rows.filter(r => routeById.has(r.routeId));

    const branchIdsToLoad = [...new Set(filtered.map(r => routeById.get(r.routeId)?.originBranchId).filter(Boolean))];
    const [users, branches] = await Promise.all([
        userIds.length ? User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'fullName'] }) : [],
        branchIdsToLoad.length ? Branch.findAll({ where: { id: { [Op.in]: branchIdsToLoad } }, attributes: ['id', 'name'] }) : [],
    ]);
    const userById = new Map(users.map(u => [u.id, u]));
    const branchByRoute = new Map(routes.map(r => [r.id, branches.find(b => b.id === r.originBranchId)]));

    const items = filtered.map(inc => ({
        id: inc.id,
        routeId: inc.routeId,
        driverName: userById.get(inc.userId)?.fullName || `#${inc.userId}`,
        branchName: branchByRoute.get(inc.routeId)?.name || 'Sin sucursal',
        incidentType: inc.incidentType,
        incidentTypeLabel: INCIDENT_TYPE_LABELS[inc.incidentType] || inc.incidentType,
        severity: inc.severity,
        severityLabel: SEVERITY_LABELS[inc.severity] || inc.severity,
        description: inc.description,
        latitude: inc.latitude,
        longitude: inc.longitude,
        reportedAt: inc.reportedAt,
        resolvedAt: inc.resolvedAt,
    }));

    const totalOpen = items.filter(x => !x.resolvedAt).length;

    res.render('supervision/routeIncidents', {
        items, totalOpen,
        filters: { severity: severity || '', incidentType: incidentType || '', resolved: resolved || '0' },
        labels: { types: INCIDENT_TYPE_LABELS, severities: SEVERITY_LABELS },
        currentUser: res.locals.currentUser,
    });
});

router.post('/route-incidents/:id/resolve', requireSupervisorOrAdmin, async (req, res) => {
    const branchIds = await _scopeBranchIds(res.locals.currentUser);
    const inc = await RouteIncident.findByPk(req.params.id);
    if (!inc) { return res.status(404).json({ error: 'Incidente no encontrado' }); }
    // Scope: si es supervisor, la ruta debe ser de su sucursal.
    if (branchIds !== null) {
        const route = await Route.findByPk(inc.routeId, { attributes: ['originBranchId'] });
        if (!route || !branchIds.includes(route.originBranchId)) {
            return res.status(403).json({ error: 'No autorizado' });
        }
    }
    if (!inc.resolvedAt) {
        await inc.update({ resolvedAt: new Date() });
    }
    res.json({ ok: true, resolvedAt: inc.resolvedAt });
});

module.exports = router;
