const { Zone } = require('../models/zone');
const provinceModel = require('../models/province');
const zoneResolver = require('../services/zoneResolver.service');

const list = async (req, res) => {
    const zones = await Zone.findAll({ order: [['name', 'ASC']] });
    res.render('zone/index', { zones });
};

const isDuplicateError = (err) =>
    err && (err.name === 'SequelizeUniqueConstraintError'
        || (err.original && err.original.code === '23505'));

const newForm = async (req, res) => {
    const provinces = await provinceModel.getAll();
    res.render('zone/new', { provinces, zone: null, error: null, values: {} });
};

const create = async (req, res) => {
    const { name, provinceId, baseCost, postalCodePrefixes, enabled } = req.body;
    const prefixes = postalCodePrefixes
        ? postalCodePrefixes.split(',').map(s => s.trim()).filter(Boolean)
        : null;
    try {
        await Zone.create({
            name,
            provinceId: provinceId || null,
            baseCost: baseCost || 0,
            postalCodePrefixes: prefixes,
            enabled: enabled === 'on' || enabled === 'true' || enabled === true,
        });
    } catch (err) {
        if (isDuplicateError(err)) {
            const provinces = await provinceModel.getAll();
            return res.status(409).render('zone/new', {
                provinces, zone: null,
                error: 'Ya existe una zona con ese nombre en esa provincia.',
                values: req.body,
            });
        }
        throw err;
    }
    zoneResolver.invalidateCache();
    res.redirect('/zone');
};

const updateForm = async (req, res) => {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) { return res.status(404).send('Zona no encontrada'); }
    const provinces = await provinceModel.getAll();
    res.render('zone/update', { zone, provinces, error: null });
};

const update = async (req, res) => {
    const { name, provinceId, baseCost, postalCodePrefixes, enabled } = req.body;
    const prefixes = postalCodePrefixes
        ? postalCodePrefixes.split(',').map(s => s.trim()).filter(Boolean)
        : null;
    try {
        await Zone.update({
            name,
            provinceId: provinceId || null,
            baseCost: baseCost || 0,
            postalCodePrefixes: prefixes,
            enabled: enabled === 'on' || enabled === 'true' || enabled === true,
        }, { where: { id: req.params.id } });
    } catch (err) {
        if (isDuplicateError(err)) {
            const zone = await Zone.findByPk(req.params.id);
            const provinces = await provinceModel.getAll();
            return res.status(409).render('zone/update', {
                zone, provinces,
                error: 'Ya existe una zona con ese nombre en esa provincia.',
            });
        }
        throw err;
    }
    zoneResolver.invalidateCache();
    res.redirect('/zone');
};

module.exports = { list, newForm, create, updateForm, update };
