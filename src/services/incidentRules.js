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
    VEH_OUT_OF_SERVICE: [Status.DELIVERED.id, Status.CANCELLED.id],
    OTHER:          []
});

// Estados del envío en los que un CLIENTE puede abrir cada tipo de incidencia desde
// los canales externos (portal autogestivo, chatbot, búsqueda de envío). Es la fuente
// de verdad de "cuándo tiene sentido que el cliente reporte esto":
//   - DELAY: mientras el envío sigue EN CURSO (todavía no llegó) y ya venció el plazo.
//            No aplica Pendiente (no despachado), Entregado (ya llegó) ni Cancelado.
//   - MISSING_ITEM (faltante) y PACKAGE_BROKEN (paquete roto): solo se constatan al
//            RECIBIR el paquete → únicamente con el envío ENTREGADO.
// Si el tipo no está en el mapa, no se aplica esta restricción extra (igual pasó antes
// por getEligibilityError + el bloqueo de Pendiente).
const CLIENT_ALLOWED_STATUSES = Object.freeze({
    DELAY: [
        Status.IN_TRANSIT.id, Status.AT_BRANCH.id, Status.ASSIGNED.id,
        Status.IN_PREPARATION.id, Status.FAILED_ATTEMPT.id,
    ],
    MISSING_ITEM:   [Status.DELIVERED.id],
    PACKAGE_BROKEN: [Status.DELIVERED.id],
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

// ¿El envío todavía está dentro del plazo estimado de entrega? (no figura demorado).
// Devuelve la fecha prevista (Date, normalizada a medianoche) si aún no venció, o null.
// Lo comparten el warning interno (confirmable) y el bloqueo de los canales cliente.
const delayStillWithinWindow = (shipment) => {
    if (!shipment || !shipment.expectedDeliveryDate) { return null; }
    const expected = new Date(shipment.expectedDeliveryDate);
    if (Number.isNaN(expected.getTime())) { return null; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expected.setHours(0, 0, 0, 0);
    return expected >= today ? expected : null;
};

// Warnings (no bloqueantes): el operador puede igual abrir la incidencia confirmando.
// - DELAY: envío todavía dentro del plazo estimado.
// - VEH_OUT_OF_SERVICE: muestra estado actual del vehículo (habilitado / ya fuera) para
//   que el operador verifique antes de crear. extras.transport opcional (puede no haber
//   vehículo asignado al driver).
const getEligibilityWarning = (shipment, type, extras = {}) => {
    if (!shipment || !type) { return null; }

    if (type.code === 'DELAY') {
        const expected = delayStillWithinWindow(shipment);
        if (expected) {
            const fmt = expected.toLocaleDateString('es-AR');
            return `El envío todavía está dentro del plazo estimado (entrega prevista ${fmt}). ¿Confirmás abrir igual una incidencia por demora?`;
        }
        return null;
    }

    if (type.code === 'VEH_OUT_OF_SERVICE') {
        const t = extras.transport;
        if (!t) {
            return 'No se encontró un vehículo asignado al repartidor del envío en el sistema. ¿Confirmás crear igual la incidencia?';
        }
        const label = `"${t.name}"${t.plate ? ` (${t.plate})` : ''}`;
        if (t.outOfService) {
            return `El vehículo ${label} ya figura fuera de servicio en el sistema. ¿Confirmás crear igual la incidencia?`;
        }
        if (!t.enabled) {
            return `El vehículo ${label} está deshabilitado en el sistema. ¿Confirmás crear igual la incidencia?`;
        }
        return `El vehículo ${label} figura habilitado y operativo en el sistema. ¿Confirmás crear igual la incidencia para reportarlo fuera de servicio?`;
    }

    return null;
};

// Validación para los canales del CLIENTE (portal de incidencias + chatbot), que NO
// tienen el paso "confirmar igual" del alta interna. Aplica las mismas reglas duras
// que getEligibilityError (duplicado del mismo tipo + estado bloqueado) y además
// convierte el warning de demora en un BLOQUEO: si el envío sigue dentro del plazo,
// el cliente no puede abrir una incidencia por demora (aún no figura demorado).
// Devuelve un mensaje (string) o null si está OK.
const getClientEligibilityError = (shipment, type, existingOpenIncidents = []) => {
    const hard = getEligibilityError(shipment, type, existingOpenIncidents);
    if (hard) { return hard; }

    // El envío todavía no fue despachado (Pendiente): no se movió, no hay incidencia
    // posible desde un canal cliente. Aplica a TODOS los tipos.
    if (shipment && shipment.statusId === Status.PENDING.id) {
        return 'El envío todavía está pendiente de despacho, así que aún no se puede reportar una incidencia desde este canal. Cuando esté en camino vas a poder hacerlo. Ante cualquier duda, contactá a soporte.';
    }

    // Coherencia por tipo: el estado del envío debe estar dentro de los permitidos
    // para ese tipo en canal cliente (faltante/roto → solo Entregado; demora → en curso).
    const allowedStatuses = type ? CLIENT_ALLOWED_STATUSES[type.code] : null;
    if (allowedStatuses && shipment && !allowedStatuses.includes(shipment.statusId)) {
        if (type.code === 'MISSING_ITEM' || type.code === 'PACKAGE_BROKEN') {
            return `Solo podés reportar una incidencia de "${type.description}" cuando el envío figura como Entregado (lo recibiste y constataste el problema). Si tenés otro inconveniente, elegí el tipo que corresponda o contactá a soporte.`;
        }
        return `No se puede reportar una incidencia de "${type.description}" con el envío en estado "${statusDescription(shipment.statusId)}". Revisá el estado actual de tu envío o contactá a soporte.`;
    }

    // Demora: además del estado, el envío debe haber superado su fecha estimada.
    if (type && type.code === 'DELAY') {
        const expected = delayStillWithinWindow(shipment);
        if (expected) {
            const fmt = expected.toLocaleDateString('es-AR');
            return `El envío todavía está dentro del plazo estimado de entrega (prevista para el ${fmt}), así que aún no figura como demorado y no podemos registrar una incidencia por demora. Si el problema es otro, elegí el tipo que corresponda.`;
        }
    }

    return null;
};

module.exports = {
    INCIDENT_TYPE_BLOCKED_STATUSES,
    getEligibilityError, getEligibilityWarning, getClientEligibilityError,
    delayStillWithinWindow,
};
