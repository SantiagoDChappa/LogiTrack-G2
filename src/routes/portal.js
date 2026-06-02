const express = require('express');
const router = express.Router();
const {
    getPortal, getPublicCreateForm, createPublic, publicSuccess,
    createPublicApi, getIncidentTypesApi,
    getSelfServiceForm, saveSelfService,
} = require('../controllers/portal');
const { evidenceUpload } = require('../middlewares/upload');

// Tolera ausencia de archivo y errores de multer (tipo/tamaño) sin romper el alta.
const optionalEvidence = (req, res, next) => {
    evidenceUpload.single('evidence')(req, res, (err) => {
        if (err) { req.file = undefined; }
        next();
    });
};

router.get('/',                        getPortal);
router.get('/portal/incident/new',     getPublicCreateForm);
router.post('/portal/incident',        optionalEvidence, createPublic);
router.get('/portal/incident/success', publicSuccess);

// API JSON (usado por chatbot wizard)
router.get('/portal/incident/types',   getIncidentTypesApi);
router.post('/portal/incident/api',    createPublicApi);

// Sprint 3 - 3.2 Autogestión destinatario (token único por envío)
router.get('/portal/self/:token',      getSelfServiceForm);
router.post('/portal/self/:token',     saveSelfService);

module.exports = router;
