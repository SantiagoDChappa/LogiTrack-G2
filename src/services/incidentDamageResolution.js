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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Matchea el código real del catálogo (PACKAGE_BROKEN) y descripciones en español.
const DAMAGE_RE = /(package_broken|broken|da[nñ]ad|roto|damage|rotura)/i;

function isDamageType(type) {
    return DAMAGE_RE.test(`${type?.code || ''} ${type?.description || ''}`);
}

// LGT-204 Esc.1/2 — al crear una incidencia de paquete dañado, avisar al
// remitente (quien pagó) con un acceso al portal para elegir reembolso/reemplazo.
async function notifySenderIfDamage({ incidentId, shipment, type }) {
    try {
        if (!isDamageType(type)) { return false; }
        let senderEmail = shipment?.sender?.email || null;
        const trackingId = shipment?.trackingId || shipment?.id;
        if (!senderEmail && shipment?.id) {
            const { Shipment } = require('../models/shipment');
            const full = await Shipment.findByPk(shipment.id, { include: [{ association: 'sender' }] });
            senderEmail = full?.sender?.email || null;
        }
        if (!EMAIL_RE.test(String(senderEmail || '').trim())) { return false; }

        // Enlace directo a la incidencia creada (no al alta de una nueva).
        const { baseUrl } = require('./notificationPlaceholders');
        const link = incidentId
            ? `${baseUrl()}/portal/mis-envios/incidencia/${incidentId}`
            : `${baseUrl()}/portal/mis-envios`;
        const body = `Tu paquete llegó con daño (envío ${trackingId}).\n\n` +
            `¿Querés un reembolso o un reemplazo? Ingresá al portal y elegí una opción:\n${link}\n\n` +
            `Incidencia #${incidentId}.`;
        const { sendEmail } = require('./notification/emailSender');
        await sendEmail(senderEmail, '[LogiTrack] Tu paquete llegó con daño — elegí reembolso o reemplazo', body, 'text');
        return true;
    } catch { return false; }
}

module.exports = { CHOICES, setChoice, getChoice, isDamageType, notifySenderIfDamage };
