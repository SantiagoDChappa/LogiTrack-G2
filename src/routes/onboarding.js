const express = require('express');
const router = express.Router();
const { complete, replay } = require('../controllers/onboarding');

router.post('/complete', complete);
router.post('/replay', replay);

module.exports = router;
