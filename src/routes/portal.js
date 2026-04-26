const express = require('express');
const router = express.Router();
const { getPortal } = require('../controllers/portal');

router.get('/', getPortal);

module.exports = router;
