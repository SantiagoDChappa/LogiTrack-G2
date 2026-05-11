const { Zone } = require('../models/zone');
const provinceModel = require('../models/province');
const zoneResolver = require('../services/zoneResolver.service');

const list = async (req, res) => {
    const zones = await Zone.findAll({ order: [['name', 'ASC']] });
    res.render('zone/index', { zones });
};

const newForm = async (req, res) => {
    const provinces = await provinceModel.getAll();
    res.render('zone/new', { provinces, zone: null });
};

const create = async (req, res) => {
    const { name, provinceId, baseCost, postalCodePrefixes, enabled } = req.body;
    const prefixes = postalCodePrefixes
        ? postalCodePrefixes.split(',').map(s => s.trim()).filter(Boolean)
        : null;
    await Zone.create({
        name,
        provinceId: provinceId || null,
        baseCost: baseCost || 0,
        postalCodePrefixes: prefixes,
        enabled: enabled === 'on' || enabled === 'true' || enabled === true,
    });
    zoneResolver.invalidateCache();
    res.redirect('/zone');
};

const updateForm = async (req, res) => {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) { return res.status(404).send('Zona no encontrada'); }
    const provinces = await provinceModel.getAll();
    res.render('zone/update', { zone, provinces });
};

const update = async (req, res) => {
    const { name, provinceId, baseCost, postalCodePrefixes, enabled } = req.body;
    const prefixes = postalCodePrefixes
        ? postalCodePrefixes.split(',').map(s => s.trim()).filter(Boolean)
        : null;
    await Zone.update({
        name,
        provinceId: provinceId || null,
        baseCost: baseCost || 0,
        postalCodePrefixes: prefixes,
        enabled: enabled === 'on' || enabled === 'true' || enabled === true,
    }, { where: { id: req.params.id } });
    zoneResolver.invalidateCache();
    res.redirect('/zone');
};

module.exports = { list, newForm, create, updateForm, update };
