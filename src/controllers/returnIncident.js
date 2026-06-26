// Devoluciones como incidencias (tipo RETURN). Reemplaza la bandeja returnAdmin
// (basada en shipment_return) por el flujo de incidencias:
//   - Alta interna (staff) desde el detalle de envío.
//   - Tomar / resolver (aprobar → nota de crédito al remitente / rechazar) desde
//     el detalle de la incidencia.
// Toda la lógica vive en returnIncidentService (elegibilidad, NC, emails, historial).
const shipmentModel = require('../models/shipment');
const returnIncidentService = require('../services/returnIncidentService');
const { ReturnReason, ReturnReasonLabel } = require('../constants/enums');

const REASON_OPTIONS = Object.values(ReturnReason).map((code) => ({ code, label: ReturnReasonLabel[code] }));

// Form interno de alta (staff) para un envío elegible.
const getCreateForm = async (req, res) => {
    const shipmentId = Number(req.query.shipmentId);
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) { return res.status(404).render('error', { message: 'Envío no encontrado' }); }

    const elig = await returnIncidentService.checkEligibility(shipment);
    if (!elig.ok) {
        // No elegible (no entregado / fuera de ventana / ya tiene devolución): vuelve al envío.
        return res.redirect(`/shipment/detail/${shipmentId}?returnError=${encodeURIComponent(elig.error)}`);
    }

    res.render('return/internalNew', {
        shipment, reasons: REASON_OPTIONS, windowDays: elig.windowDays, error: null, form: {},
    });
};

// Alta interna: crea la devolución como incidencia RETURN a nombre del staff logueado.
const createInternal = async (req, res) => {
    const shipmentId = Number(req.body.shipmentId);
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) { return res.status(404).render('error', { message: 'Envío no encontrado' }); }

    const result = await returnIncidentService.createReturn({
        shipment, userId: res.locals.currentUser?.id, body: req.body,
    });

    if (!result.ok) {
        const elig = await returnIncidentService.checkEligibility(shipment);
        return res.status(result.status || 400).render('return/internalNew', {
            shipment, reasons: REASON_OPTIONS, windowDays: elig.windowDays, error: result.message, form: req.body,
        });
    }
    res.redirect(`/incident/${result.incidentId}`);
};

// Tomar la devolución para revisión (OPEN → IN_REVIEW + asignación).
const take = async (req, res) => {
    const incidentId = Number(req.params.id);
    const result = await returnIncidentService.takeReturn({ incidentId, userId: res.locals.currentUser?.id });
    if (!result.ok) {
        return res.redirect(`/incident/${incidentId}?error=${encodeURIComponent(result.message)}`);
    }
    res.redirect(`/incident/${incidentId}`);
};

// Resolver: approve → cierre PROCEDENTE + nota de crédito al remitente; reject → cierre NO_PROCEDENTE.
const resolve = async (req, res) => {
    const incidentId = Number(req.params.id);
    const result = await returnIncidentService.resolveReturn({
        incidentId,
        userId: res.locals.currentUser?.id,
        decision: req.body.decision,
        rejectionReason: req.body.rejectionReason,
    });
    if (!result.ok) {
        return res.redirect(`/incident/${incidentId}?error=${encodeURIComponent(result.message)}`);
    }
    res.redirect(`/incident/${incidentId}?ok=1`);
};

module.exports = { getCreateForm, createInternal, take, resolve };
