const express = require('express');
const router = express.Router();
const { complete, replay, moduleComplete } = require('../controllers/onboarding');

router.post('/complete', complete);
router.post('/replay', replay);
router.post('/module-complete', moduleComplete);

module.exports = router;
