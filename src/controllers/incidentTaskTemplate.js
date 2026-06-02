// ABM de plantillas de checklist por tipo de incidencia (US-E03 parcial).
// Solo supervisor/admin (protegido en rutas).
const incidentTypeModel = require('../models/incidentType');
const templateModel     = require('../models/incidentTaskTemplate');
const { IncidentTaskTemplate } = templateModel;

const list = async (req, res) => {
    const types = await incidentTypeModel.getActive();
    const grouped = await Promise.all(types.map(async (type) => ({
        type,
        templates: await templateModel.getAllByType(type.id)
    })));
    res.render('incident/templates', {
        grouped,
        error: req.query.error || null,
        saved: req.query.saved === '1'
    });
};

const create = async (req, res) => {
    const incidentTypeId = Number(req.body.incidentTypeId);
    const description = String(req.body.description || '').trim();
    const ordering = req.body.ordering ? Number(req.body.ordering) : 0;
    const required = req.body.required === 'on' || req.body.required === 'true' || req.body.required === '1';

    const type = await incidentTypeModel.getById(incidentTypeId);
    if (!type) { return res.redirect('/incident/config/templates?error=tipo_invalido'); }
    if (!description) { return res.redirect('/incident/config/templates?error=descripcion_requerida'); }

    await IncidentTaskTemplate.create({
        incidentTypeId,
        description: description.slice(0, 200),
        ordering,
        required,
        active: true
    });
    res.redirect('/incident/config/templates?saved=1');
};

const update = async (req, res) => {
    const id = Number(req.params.id);
    const tpl = await templateModel.getById(id);
    if (!tpl) { return res.redirect('/incident/config/templates?error=no_encontrada'); }

    const description = String(req.body.description || '').trim();
    const updates = {
        ordering: req.body.ordering !== undefined ? Number(req.body.ordering) : tpl.ordering,
        required: req.body.required === 'on' || req.body.required === 'true' || req.body.required === '1',
        active:   req.body.active   === 'on' || req.body.active   === 'true' || req.body.active   === '1'
    };
    if (description) { updates.description = description.slice(0, 200); }
    await tpl.update(updates);
    res.redirect('/incident/config/templates?saved=1');
};

// Baja lógica (desactiva la plantilla; no afecta tareas ya snapshotteadas).
const deactivate = async (req, res) => {
    const id = Number(req.params.id);
    const tpl = await templateModel.getById(id);
    if (tpl) { await tpl.update({ active: false }); }
    res.redirect('/incident/config/templates?saved=1');
};

module.exports = { list, create, update, deactivate };
