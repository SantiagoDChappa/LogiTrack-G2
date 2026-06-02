// Snapshot del checklist de una incidencia: copia las plantillas de tareas
// activas del tipo a filas concretas de incident_task al crear la incidencia.
// Se reutiliza en alta interna, alta por portal y auto-generacion.
const incidentTaskTemplateModel = require('../models/incidentTaskTemplate');
const { IncidentTask } = require('../models/incidentTask');

const snapshotChecklist = async (incidentId, incidentTypeId, t) => {
    const templates = await incidentTaskTemplateModel.getActiveByType(incidentTypeId, { transaction: t });
    if (!templates.length) { return []; }

    const rows = templates.map(tpl => ({
        incidentId,
        templateId:  tpl.id,
        description: tpl.description,
        required:    tpl.required,
        done:        false,
        ordering:    tpl.ordering
    }));
    return IncidentTask.bulkCreate(rows, { transaction: t || null });
};

module.exports = { snapshotChecklist };
