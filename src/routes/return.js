const express = require('express');
const router = express.Router();
const { list, detail, resolve } = require('../controllers/returnAdmin');

// Gestión interna de devoluciones (LGT-183). Montado con requireSupervisor en app.js.
router.get('/', list);
router.get('/:id', detail);
router.post('/:id/resolve', resolve);

module.exports = router;
