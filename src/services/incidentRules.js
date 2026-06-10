const { Status } = require('../constants/enums');

// Matriz tipo de incidencia -> estados de envio donde NO aplica abrirla.
// Si el statusId del shipment esta en esta lista, getEligibilityError lo bloquea.
// OTHER es catch-all: nunca bloqueado por estado.
const INCIDENT_TYPE_BLOCKED_STATUSES = Object.freeze({
    PACKAGE_BROKEN: [Status.PENDING.id, Status.CANCELLED.id],
    DELAY:          [Status.DELIVERED.id, Status.CANCELLED.id, Status.PACKAGE_FAILED.id],
    MISSING_ITEM:   [Status.PENDING.id, Status.IN_TRANSIT.id, Status.CANCELLED.id],
    WRONG_ADDRESS:  [Status.DELIVERED.id, Status.CANCELLED.id, Status.PACKAGE_FAILED.id],
    LOST:           [Status.PENDING.id, Status.DELIVERED.id, Status.CANCELLED.id, Status.IN_PREPARATION.id],
    DELIVERY_FAILED: [],
    OTHER:          []
});

const statusDescription = (statusId) => {
    const entry = Object.values(Status).find(s => s.id === statusId);
    return entry ? entry.description : `estado ${statusId}`;
};

// Devuelve un mensaje (string) si la combinacion (tipo, estado, duplicados) bloquea
// la apertura de una nueva incidencia, o null si todo OK.
//
// - shipment: instancia/objeto con .statusId
// - type: objeto con .id, .code, .description (del catalogo incident_type)
// - existingOpenIncidents: array de { incidentTypeId, id, status } (con status OPEN o IN_REVIEW)
//
// Reglas (en orden):
// 1) Si el type.code es distinto de 'OTHER' y hay un duplicado abierto del mismo tipo -> bloquea.
//    OTHER es catch-all: se permiten varios abiertos simultaneos en el mismo envio.
// 2) Si el statusId del shipment esta en la lista de estados bloqueados para ese type.code -> bloquea.
const getEligibilityError = (shipment, type, existingOpenIncidents = []) => {
    if (!shipment || !type) { return null; }

    if (type.code !== 'OTHER') {
        const dup = existingOpenIncidents.find(i => i.incidentTypeId === type.id);
        if (dup) {
            return `Ya existe una incidencia '${type.description}' abierta para este envío (#${dup.id}). Esperá a que se cierre antes de abrir otra.`;
        }
    }

    const blocked = INCIDENT_TYPE_BLOCKED_STATUSES[type.code];
    if (blocked && blocked.includes(shipment.statusId)) {
        return `No se puede abrir una incidencia '${type.description}' porque el envío está en estado '${statusDescription(shipment.statusId)}'.`;
    }

    return null;
};

// Warnings (no bloqueantes): el operador puede igual abrir la incidencia confirmando.
// Hoy solo aplicamos a DELAY cuando el envío aún está dentro del plazo estimado.
const getEligibilityWarning = (shipment, type) => {
    if (!shipment || !type) { return null; }
    if (type.code !== 'DELAY') { return null; }
    if (!shipment.expectedDeliveryDate) { return null; }

    const expected = new Date(shipment.expectedDeliveryDate);
    if (Number.isNaN(expected.getTime())) { return null; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expected.setHours(0, 0, 0, 0);

    if (expected >= today) {
        const fmt = expected.toLocaleDateString('es-AR');
        return `El envío todavía está dentro del plazo estimado (entrega prevista ${fmt}). ¿Confirmás abrir igual una incidencia por demora?`;
    }
    return null;
};

module.exports = { INCIDENT_TYPE_BLOCKED_STATUSES, getEligibilityError, getEligibilityWarning };
