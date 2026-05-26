const express = require('express');
const router = express.Router();
const {
    getPortal, getPublicCreateForm, createPublic, publicSuccess,
    createPublicApi, confirmIncident, getIncidentTypesApi,
    getSelfServiceForm, saveSelfService,
} = require('../controllers/portal');

router.get('/',                        getPortal);
router.get('/portal/incident/new',     getPublicCreateForm);
router.post('/portal/incident',        createPublic);
router.get('/portal/incident/confirm', confirmIncident);
router.get('/portal/incident/success', publicSuccess);

// API JSON (usado por chatbot wizard)
router.get('/portal/incident/types',   getIncidentTypesApi);
router.post('/portal/incident/api',    createPublicApi);

// Sprint 3 - 3.2 Autogestión destinatario (token único por envío)
router.get('/portal/self/:token',      getSelfServiceForm);
router.post('/portal/self/:token',     saveSelfService);

module.exports = router;
