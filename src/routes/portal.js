const express = require('express');
const router = express.Router();
const {
    getPortal, getPublicCreateForm, createPublic, publicSuccess,
    createPublicApi, confirmIncident, getIncidentTypesApi,
    getSelfServiceForm, saveSelfService, getSelfServiceSaved, getLiveMap, getLivePosition, getLiveEta,
} = require('../controllers/portal');
const {
    getIdentifyForm, postRequestAccess, postConfirmAccess, getConfirmAccess,
    getShipmentList, getShipmentDetail, getManageForm, postManageForm,
    getIncidentList, getIncidentDetail, postIncidentResponse, postDamageChoice, postDamageDecline, getIncidentAttachment,
    getSurveyList, getSurveyForm, postSurvey, getPublicSurveyForm, postPublicSurvey,
    getIncidentSurveyList, getIncidentSurveyForm, postIncidentSurvey, postLogout,
} = require('../controllers/portalClient');
const { getReturnForm, postReturn, listReturns, returnDetail, postEditModality, returnCreditNote } = require('../controllers/portalReturn');
const { getCheckout, postPay, postPayMp, postWebhook } = require('../controllers/payment');
const { requirePortalClient, optionalPortalClient } = require('../middlewares/portalClient');
const { evidenceUpload } = require('../middlewares/upload');

// Tolera ausencia de archivo y errores de multer (tipo/tamaño) sin romper el alta.
const optionalEvidence = (req, res, next) => {
    evidenceUpload.single('evidence')(req, res, (err) => {
        if (err) { req.file = undefined; }
        next();
    });
};

const portalEvidenceUpload = (req, res, next) => {
    evidenceUpload.single('evidence')(req, res, (err) => {
        if (!err) { return next(); }
        if (err.code === 'LIMIT_FILE_SIZE') {
            req.uploadError = 'Archivo excede los 10MB';
        } else {
            req.uploadError = err.message || 'Archivo no válido.';
        }
        return next();
    });
};

router.get('/',                        getPortal);
// Última Milla — mapa de seguimiento en vivo (link del mail "ya casi llego"), público.
router.get('/track/:trackingId/live',     getLiveMap);
// Datos del mapa en vivo (públicos, sin login): posición del repartidor + franja de ETA.
router.get('/track/:trackingId/position', getLivePosition);
router.get('/track/:trackingId/eta',      getLiveEta);
router.get('/portal/incident/new',     getPublicCreateForm);
router.post('/portal/incident',        optionalEvidence, createPublic);
router.get('/portal/incident/confirm', confirmIncident);
router.get('/portal/incident/success', publicSuccess);

// API JSON (usado por chatbot wizard)
router.get('/portal/incident/types',   getIncidentTypesApi);
router.post('/portal/incident/api',    createPublicApi);

// Sprint 3 - 3.2 Autogestión destinatario (token único por envío)
router.get('/portal/self/:token',             getSelfServiceForm);
router.post('/portal/self/:token',            saveSelfService);
router.get('/portal/self-saved/:trackingId',  getSelfServiceSaved);

// CP-ENCS03 — Encuesta de satisfacción accesible desde el email sin login (token firmado)
router.get('/portal/encuesta/:token',  getPublicSurveyForm);
router.post('/portal/encuesta/:token', postPublicSurvey);

// [prototype] Pago de la factura (link del mail al remitente, sin login). "mercadopago"
// crea una preferencia real si MP está configurado; si no, cae al simulado de postPay.
router.get('/pago/:token',     getCheckout);
router.post('/pago/:token',    postPay);
router.post('/pago/:token/mp', postPayMp);

// Webhook de Mercado Pago (servidor a servidor, sin login).
router.post('/payment/webhook', postWebhook);

// Portal — Mis envíos del cliente (HU 1)
router.get('/portal/mis-envios',              optionalPortalClient, getIdentifyForm);
router.post('/portal/mis-envios/acceso',      postRequestAccess);
router.post('/portal/mis-envios/confirm',     postConfirmAccess);
router.get('/portal/mis-envios/confirm',      getConfirmAccess);
router.get('/portal/mis-envios/lista',        requirePortalClient, getShipmentList);
router.get('/portal/mis-envios/envio/:id',    requirePortalClient, getShipmentDetail);
router.get('/portal/mis-envios/envio/:id/gestion', requirePortalClient, getManageForm);
router.post('/portal/mis-envios/envio/:id/gestion', requirePortalClient, postManageForm);
// LGT-182 — solicitud de devolución de un envío elegible.
router.get('/portal/mis-envios/envio/:id/devolucion',  requirePortalClient, getReturnForm);
router.post('/portal/mis-envios/envio/:id/devolucion', requirePortalClient, postReturn);
// LGT-186 — seguimiento de devoluciones del cliente.
router.get('/portal/mis-envios/devoluciones',     requirePortalClient, listReturns);
router.get('/portal/mis-envios/devolucion/:id',   requirePortalClient, returnDetail);
// LGT-184 Esc.7/8 — editar modalidad mientras la devolución no fue tomada operativamente.
router.post('/portal/mis-envios/devolucion/:id/modalidad', requirePortalClient, postEditModality);
// LGT-214 — comprobante de nota de crédito (acceso desde portal del cliente, con aislamiento).
router.get('/portal/mis-envios/nota-credito/:id', requirePortalClient, returnCreditNote);
router.get('/portal/mis-envios/incidencias',        requirePortalClient, getIncidentList);
router.get('/portal/mis-envios/incidencia/:id',     requirePortalClient, getIncidentDetail);
router.post('/portal/mis-envios/incidencia/:id/responder', requirePortalClient, portalEvidenceUpload, postIncidentResponse);
router.post('/portal/mis-envios/incidencia/:id/eleccion',  requirePortalClient, postDamageChoice);
router.post('/portal/mis-envios/incidencia/:id/no-devolucion', requirePortalClient, postDamageDecline);
router.get('/portal/mis-envios/incidencia/:id/adjunto/:attId', requirePortalClient, getIncidentAttachment);
router.get('/portal/mis-envios/encuestas',                    requirePortalClient, getSurveyList);
router.get('/portal/mis-envios/encuesta/:shipmentId',         requirePortalClient, getSurveyForm);
router.post('/portal/mis-envios/encuesta/:shipmentId',        requirePortalClient, postSurvey);
router.get('/portal/mis-envios/encuestas-incidencias',                    requirePortalClient, getIncidentSurveyList);
router.get('/portal/mis-envios/encuesta-incidencia/:incidentId',          requirePortalClient, getIncidentSurveyForm);
router.post('/portal/mis-envios/encuesta-incidencia/:incidentId',         requirePortalClient, postIncidentSurvey);
router.post('/portal/mis-envios/salir',       postLogout);

module.exports = router;
