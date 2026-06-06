// LGT-204 — elección del remitente ante una incidencia de paquete dañado.
// El remitente (quien pagó el envío) elige REEMBOLSO o REEMPLAZO; queda
// registrado en la incidencia + historial y visible para el Supervisor.

const { Incident } = require('../models/incident');
const incidentHistory = require('../models/incidentHistory');

const CHOICES = ['REEMBOLSO', 'REEMPLAZO'];

async function setChoice({ incidentId, choice, by, userId, personId }) {
    const c = String(choice || '').toUpperCase();
    if (!CHOICES.includes(c)) { throw new Error('Opción inválida (REEMBOLSO o REEMPLAZO)'); }
    const incident = await Incident.findByPk(incidentId);
    if (!incident) { throw new Error('Incidencia no encontrada'); }
    if (incident.closedAt) { throw new Error('La incidencia ya fue cerrada'); }

    const prev = incident.damageChoice;
    await incident.update({ damageChoice: c, damageChoiceAt: new Date(), damageChoiceBy: by || null });
    await incidentHistory.create({
        incidentId,
        eventType: 'DAMAGE_CHOICE',
        fromValue: prev || null,
        toValue:   c,
        comment:   `Elección del remitente: ${c}${by ? ' (' + by + ')' : ''}${prev ? ` (antes: ${prev})` : ''}`,
        userId:    userId || null,
        personId:  personId || null,
    });
    return incident;
}

function getChoice(incident) { return incident ? incident.damageChoice || null : null; }

module.exports = { CHOICES, setChoice, getChoice };
