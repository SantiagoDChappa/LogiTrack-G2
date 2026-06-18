// LGT-204 — elección del remitente ante una incidencia de paquete dañado.
// El remitente (quien pagó el envío) elige REEMBOLSO o REEMPLAZO; queda
// registrado en la incidencia + historial y visible para el Supervisor.

const { Incident } = require('../models/incident');
const incidentHistory = require('../models/incidentHistory');

// Se eliminó el reemplazo: la única resolución ante paquete dañado es el reembolso.
const CHOICES = ['REEMBOLSO'];

async function setChoice({ incidentId, choice, by, userId, personId }) {
    const c = String(choice || '').toUpperCase();
    if (!CHOICES.includes(c)) { throw new Error('Opción inválida (sólo REEMBOLSO)'); }
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

    // Impacto en el envío (best-effort: no rompe el registro de la elección).
    // Solo actúa si la decisión cambió, para no duplicar (cancelar de nuevo / crear 2 reemplazos).
    if (c !== prev) {
        try { await applyChoiceToShipment({ shipmentId: incident.shipmentId, choice: c, by, userId }); }
        catch (e) { console.warn('[damage] applyChoiceToShipment:', e.message); }
    }
    return incident;
}

// REEMBOLSO → el envío se cancela (no se reenvía). El reemplazo fue eliminado.
async function applyChoiceToShipment({ shipmentId, choice, by, userId }) {
    const shipmentModel = require('../models/shipment');
    const { Shipment } = shipmentModel;
    const shipmentHistoryModel = require('../models/shipmentHistory');
    const { Status, NotificationEvent } = require('../constants/enums');
    const sh = await Shipment.findByPk(shipmentId);
    if (!sh) { return; }

    if (choice === 'REEMBOLSO') {
        if (sh.statusId === Status.CANCELLED.id) { return; }
        const fromStatusId = sh.statusId;
        await Shipment.update({ statusId: Status.CANCELLED.id }, { where: { id: shipmentId } });
        await shipmentHistoryModel.create({
            shipmentId, fromStatusId, toStatusId: Status.CANCELLED.id,
            comment: `Envío cancelado por reembolso (paquete dañado)${by ? ' — solicitado por ' + by : ''}.`,
            userId: userId || null, eventType: 'STATUS_CHANGE',
        });
        try {
            require('../controllers/shipment')
                .notifyShipmentEvent(NotificationEvent.SHIPMENT_CANCELLED, shipmentId).catch(() => {});
        } catch { /* notif best-effort */ }
        return;
    }
}

function getChoice(incident) { return incident ? incident.damageChoice || null : null; }

// Matchea el código real del catálogo (PACKAGE_BROKEN) y descripciones en español.
const DAMAGE_RE = /(package_broken|broken|da[nñ]ad|roto|damage|rotura)/i;

function isDamageType(type) {
    return DAMAGE_RE.test(`${type?.code || ''} ${type?.description || ''}`);
}

// LGT-204 Esc.1/2 — al crear una incidencia de paquete dañado, avisar al
// remitente (quien pagó) con un acceso al portal para elegir reembolso/reemplazo.
// Usa el evento configurable SHIPMENT_PACKAGE_DAMAGED (Ajustes → Comunicaciones →
// Incidencias): respeta el toggle on/off, el destinatario y la plantilla editable.
async function notifySenderIfDamage({ incidentId, shipment, type }) {
    try {
        if (!isDamageType(type)) { return false; }
        const shipmentId = shipment?.id;
        if (!shipmentId) { return false; }

        const { NotificationEvent } = require('../constants/enums');
        // El destinatario (remitente) y el contenido los resuelve el sistema de plantillas.
        // incidentId → token {{incidentId}}; _incidentId → habilita {{incidentUrl}} hacia ESTA incidencia.
        await require('../controllers/shipment').notifyShipmentEvent(
            NotificationEvent.SHIPMENT_PACKAGE_DAMAGED,
            shipmentId,
            { incidentId: String(incidentId), _incidentId: String(incidentId) }
        );
        return true;
    } catch (e) {
        console.warn('[damage] notifySenderIfDamage:', e.message);
        return false;
    }
}

module.exports = { CHOICES, setChoice, getChoice, isDamageType, notifySenderIfDamage };
