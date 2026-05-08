const { Transport } = require('../models/transport');
const { TransportZone } = require('../models/transportZone');
const { User } = require('../models/user');
const { Branch } = require('../models/branch');
const { RoleType } = require('../constants/enums');
const transportModel = require('../models/transport');
const zoneModel = require('../models/zone');

const list = async (req, res) => {
    const transports = await transportModel.getAll();
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
    const { name, plate, maxWeightKg, maxVolumeM3, fixedCost, costPerKm, driverUserId, branchId, enabled, zoneIds } = req.body;
    const transport = await Transport.create({
        name,
        plate: plate || null,
        maxWeightKg, maxVolumeM3,
        fixedCost: fixedCost || 0, costPerKm: costPerKm || 0,
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
    const { name, plate, maxWeightKg, maxVolumeM3, fixedCost, costPerKm, driverUserId, branchId, enabled, zoneIds } = req.body;
    await Transport.update({
        name, plate: plate || null,
        maxWeightKg, maxVolumeM3,
        fixedCost: fixedCost || 0, costPerKm: costPerKm || 0,
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

module.exports = { list, newForm, create, updateForm, update, toggleEnabled };
