const express = require('express');
const router = express.Router();
const { complete, replay, moduleComplete, releaseSeen } = require('../controllers/onboarding');

router.post('/complete', complete);
router.post('/replay', replay);
router.post('/module-complete', moduleComplete);
router.post('/release-seen', releaseSeen);

module.exports = router;
