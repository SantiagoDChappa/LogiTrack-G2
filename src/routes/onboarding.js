const express = require('express');
const router = express.Router();
const { complete } = require('../controllers/onboarding');

router.post('/complete', complete);

module.exports = router;
