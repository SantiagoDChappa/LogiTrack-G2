const express = require('express');
const router = express.Router();
const {
    getPortal, getPublicCreateForm, createPublic, publicSuccess,
    createPublicApi, getIncidentTypesApi
} = require('../controllers/portal');

router.get('/',                        getPortal);
router.get('/portal/incident/new',     getPublicCreateForm);
router.post('/portal/incident',        createPublic);
router.get('/portal/incident/success', publicSuccess);

// API JSON (usado por chatbot wizard)
router.get('/portal/incident/types',   getIncidentTypesApi);
router.post('/portal/incident/api',    createPublicApi);

module.exports = router;
