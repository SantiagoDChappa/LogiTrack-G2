const express = require('express');
const router = express.Router();
const { view } = require('../controllers/creditNote');

// Comprobante de nota de crédito (LGT-214). Montado con requireAuth en app.js.
router.get('/:id', view);

module.exports = router;
