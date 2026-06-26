const express = require('express');
const router = express.Router();
const { view } = require('../controllers/invoice');

// Comprobante de factura del envío. Montado con requireAuth en app.js.
router.get('/:id', view);

module.exports = router;
