const { Transport } = require('../models/transport');
const { TransportZone } = require('../models/transportZone');
const { User } = require('../models/user');
const { Branch } = require('../models/branch');
const { RoleType } = require('../constants/enums');
const transportModel = require('../models/transport');
const zoneModel = require('../models/zone');

const isAdminUser = (user) => user?.roleId === RoleType.ADMIN.id;

const list = async (req, res) => {
    const user = res.locals.currentUser;
    const branchId = isAdminUser(user) ? null : (user?.branchId || null);
    const transports = await transportModel.getAll({ branchId });
    res.render('transport/index', { transports });
};

const newForm = async (req, res) => {
    const [zones, drivers, branches] = await Promise.all([
        zoneModel.getAll(),
        User.findAll({ where: { roleId: RoleType.DELIVERY.id, active: true }, order: [['fullName', 'ASC']] }),
        Branch.findAll({ order: [['name', 'ASC']] }),
    ]);
    res.render('transport/new', { zones, drivers, branches, transport: null });
};

const create = async (req, res) => {
    const { name, plate, maxWeightKg, maxVolumeM3, fixedCost, costPerKm, autonomyKm, driverUserId, branchId, enabled, zoneIds } = req.body;
    const transport = await Transport.create({
        name,
        plate: plate || null,
        maxWeightKg, maxVolumeM3,
        fixedCost: fixedCost || 0, costPerKm: costPerKm || 0,
        autonomyKm: autonomyKm ? Number(autonomyKm) : null,
        driverUserId: driverUserId || null,
        branchId: branchId || null,
        enabled: enabled === 'on' || enabled === 'true' || enabled === true,
    });
    if (zoneIds) {
        const ids = [].concat(zoneIds).map(Number).filter(Boolean);
        await Promise.all(ids.map(zoneId => TransportZone.create({ transportId: transport.id, zoneId })));
    }
    res.redirect('/transport');
};

const updateForm = async (req, res) => {
    const transport = await transportModel.getById(req.params.id);
    if (!transport) { return res.status(404).send('Transporte no encontrado'); }
    const [zones, drivers, branches] = await Promise.all([
        zoneModel.getAll(),
        User.findAll({ where: { roleId: RoleType.DELIVERY.id, active: true }, order: [['fullName', 'ASC']] }),
        Branch.findAll({ order: [['name', 'ASC']] }),
    ]);
    const selectedZoneIds = (transport.zones || []).map(z => z.id);
    res.render('transport/update', { transport, zones, drivers, branches, selectedZoneIds });
};

const update = async (req, res) => {
    const id = req.params.id;
    const { name, plate, maxWeightKg, maxVolumeM3, fixedCost, costPerKm, autonomyKm, driverUserId, branchId, enabled, zoneIds } = req.body;
    await Transport.update({
        name, plate: plate || null,
        maxWeightKg, maxVolumeM3,
        fixedCost: fixedCost || 0, costPerKm: costPerKm || 0,
        autonomyKm: autonomyKm ? Number(autonomyKm) : null,
        driverUserId: driverUserId || null,
        branchId: branchId || null,
        enabled: enabled === 'on' || enabled === 'true' || enabled === true,
    }, { where: { id } });

    await TransportZone.destroy({ where: { transportId: id } });
    if (zoneIds) {
        const ids = [].concat(zoneIds).map(Number).filter(Boolean);
        await Promise.all(ids.map(zoneId => TransportZone.create({ transportId: id, zoneId })));
    }
    res.redirect('/transport');
};

const toggleEnabled = async (req, res) => {
    const t = await Transport.findByPk(req.params.id);
    if (!t) { return res.status(404).send('No encontrado'); }
    await Transport.update({ enabled: !t.enabled }, { where: { id: t.id } });
    res.redirect('/transport');
};

const stats = async (req, res) => {
    const id = Number(req.params.id);
    const sequelize = require('../database/connection');
    const { QueryTypes } = require('sequelize');
    const t = await transportModel.getById(id);
    if (!t) { return res.status(404).send('No encontrado'); }
    const rows = await sequelize.query(
        `SELECT
            COUNT(DISTINCT r.id)::int AS routes,
            COALESCE(SUM(r."totalDistanceKm"),0)::float AS total_km,
            COALESCE(SUM(r."totalCost"),0)::float AS total_cost,
            COUNT(DISTINCT rs."shipmentId") FILTER (WHERE rs."stopType"='delivery')::int AS deliveries,
            COUNT(DISTINCT sh."shipmentId") FILTER (WHERE sh."eventType"='FAILED_ATTEMPT')::int AS failed_attempts,
            COUNT(DISTINCT sh."shipmentId") FILTER (WHERE sh."toStatusId"=4)::int AS delivered
           FROM logitrack.route r
           LEFT JOIN logitrack.route_stop rs ON rs.route_id=r.id
           LEFT JOIN logitrack.shipment_history sh ON sh."shipmentId"=rs."shipmentId" AND sh."eventType" IN ('FAILED_ATTEMPT','POD','DELIVERED')
          WHERE r."transportId"=:id`,
        { replacements: { id }, type: QueryTypes.SELECT }
    );
    const recent = await sequelize.query(
        `SELECT r.id, r."totalDistanceKm", r."totalCost", r."totalWeightKg", s.description AS status, r."createdAt"
           FROM logitrack.route r
           JOIN logitrack.status s ON s.id=r."statusId"
          WHERE r."transportId"=:id
          ORDER BY r."createdAt" DESC LIMIT 10`,
        { replacements: { id }, type: QueryTypes.SELECT }
    );
    const stat = rows[0] || {};
    const onTimePct = stat.delivered ? Number((100 * (stat.delivered - (stat.failed_attempts || 0)) / stat.delivered).toFixed(1)) : null;
    res.render('transport/stats', { transport: t, stats: { ...stat, on_time_pct: onTimePct }, recent });
};

module.exports = { list, newForm, create, updateForm, update, toggleEnabled, stats };
