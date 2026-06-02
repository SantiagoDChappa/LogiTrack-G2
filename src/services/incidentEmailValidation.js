// Servicio de validacion para incidencias publicas.
// Decisiones:
// - El reportante debe estar registrado en el envio (sender o recipient).
// - El email ingresado en el form debe coincidir (case-insensitive, trim)
//   con sender.email o recipient.email. La incidencia no se crea de una;
//   se mete en incident_pending_confirmation y se manda un mail de
//   confirmacion.
//
// La validacion devuelve siempre { ok, ... } para que el controller la
// trate sin lanzar excepciones.

const normalize = (s) => String(s || '').trim().toLowerCase();

// Devuelve true si el shipment tiene al menos un email registrado (en
// sender o recipient) que pueda servir para confirmar incidencias.
const shipmentHasAnyEmail = (shipment) => {
    if (!shipment) { return false; }
    const senderEmail    = normalize(shipment.sender    && shipment.sender.email);
    const recipientEmail = normalize(shipment.recipient && shipment.recipient.email);
    return Boolean(senderEmail) || Boolean(recipientEmail);
};

// Recibe el shipment ya cargado (con sender + recipient incluidos) y el
// email que ingreso el reportante.
//
// Devuelve uno de:
//   { ok: true, matchedPersonId, matchedRole: 'sender'|'recipient' }
//   { ok: false, code: 'shipment_has_no_emails',   message: ... }
//   { ok: false, code: 'email_does_not_match',     message: ... }
const validateReporterEmail = (shipment, reporterEmail) => {
    if (!shipmentHasAnyEmail(shipment)) {
        return {
            ok: false,
            code: 'shipment_has_no_emails',
            message: 'Este envío no tiene emails registrados de remitente ni destinatario. Contactá al operador para gestionar incidencias por otra vía.'
        };
    }

    const reporter = normalize(reporterEmail);
    if (!reporter) {
        return {
            ok: false,
            code: 'email_required',
            message: 'El email del reportante es obligatorio.'
        };
    }

    const senderEmail    = normalize(shipment.sender    && shipment.sender.email);
    const recipientEmail = normalize(shipment.recipient && shipment.recipient.email);

    if (senderEmail && reporter === senderEmail) {
        return { ok: true, matchedPersonId: shipment.sender.id,    matchedRole: 'sender'    };
    }
    if (recipientEmail && reporter === recipientEmail) {
        return { ok: true, matchedPersonId: shipment.recipient.id, matchedRole: 'recipient' };
    }

    return {
        ok: false,
        code: 'email_does_not_match',
        message: 'El email ingresado no coincide con el del remitente ni el del destinatario registrados en el envío. Solo ellos pueden reportar incidencias por este canal.'
    };
};

module.exports = { normalize, shipmentHasAnyEmail, validateReporterEmail };
