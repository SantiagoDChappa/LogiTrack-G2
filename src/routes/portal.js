const express = require('express');
const router = express.Router();
const {
    getPortal, getPublicCreateForm, createPublic, publicSuccess,
    createPublicApi, confirmIncident, getIncidentTypesApi,
    getSelfServiceForm, saveSelfService, getSelfServiceSaved,
} = require('../controllers/portal');
const {
    getIdentifyForm, postRequestAccess, postConfirmAccess, getConfirmAccess,
    getShipmentList, getShipmentDetail, getManageForm, postManageForm,
    getIncidentList, getIncidentDetail, postIncidentResponse, postDamageChoice, getIncidentAttachment,
    getSurveyList, getSurveyForm, postSurvey, getPublicSurveyForm, postPublicSurvey,
    getIncidentSurveyList, getIncidentSurveyForm, postIncidentSurvey, postLogout,
} = require('../controllers/portalClient');
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
            req.uploadError = 'El archivo supera el tamaño máximo permitido de 5 MB.';
        } else {
            req.uploadError = err.message || 'Archivo no válido.';
        }
        return next();
    });
};

router.get('/',                        getPortal);
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

// Portal — Mis envíos del cliente (HU 1)
router.get('/portal/mis-envios',              optionalPortalClient, getIdentifyForm);
router.post('/portal/mis-envios/acceso',      postRequestAccess);
router.post('/portal/mis-envios/confirm',     postConfirmAccess);
router.get('/portal/mis-envios/confirm',      getConfirmAccess);
router.get('/portal/mis-envios/lista',        requirePortalClient, getShipmentList);
router.get('/portal/mis-envios/envio/:id',    requirePortalClient, getShipmentDetail);
router.get('/portal/mis-envios/envio/:id/gestion', requirePortalClient, getManageForm);
router.post('/portal/mis-envios/envio/:id/gestion', requirePortalClient, postManageForm);
router.get('/portal/mis-envios/incidencias',        requirePortalClient, getIncidentList);
router.get('/portal/mis-envios/incidencia/:id',     requirePortalClient, getIncidentDetail);
router.post('/portal/mis-envios/incidencia/:id/responder', requirePortalClient, portalEvidenceUpload, postIncidentResponse);
router.post('/portal/mis-envios/incidencia/:id/eleccion',  requirePortalClient, postDamageChoice);
router.get('/portal/mis-envios/incidencia/:id/adjunto/:attId', requirePortalClient, getIncidentAttachment);
router.get('/portal/mis-envios/encuestas',                    requirePortalClient, getSurveyList);
router.get('/portal/mis-envios/encuesta/:shipmentId',         requirePortalClient, getSurveyForm);
router.post('/portal/mis-envios/encuesta/:shipmentId',        requirePortalClient, postSurvey);
router.get('/portal/mis-envios/encuestas-incidencias',                    requirePortalClient, getIncidentSurveyList);
router.get('/portal/mis-envios/encuesta-incidencia/:incidentId',          requirePortalClient, getIncidentSurveyForm);
router.post('/portal/mis-envios/encuesta-incidencia/:incidentId',         requirePortalClient, postIncidentSurvey);
router.post('/portal/mis-envios/salir',       postLogout);

module.exports = router;
