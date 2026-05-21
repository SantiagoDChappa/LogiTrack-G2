const express = require('express');
const router = express.Router();
const { getPortal, getPublicCreateForm, createPublic, publicSuccess } = require('../controllers/portal');

router.get('/',                        getPortal);
router.get('/portal/incident/new',     getPublicCreateForm);
router.post('/portal/incident',        createPublic);
router.get('/portal/incident/success', publicSuccess);

module.exports = router;
