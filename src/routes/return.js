const express = require('express');
const router = express.Router();
const { getCreateForm, createInternal, take, resolve } = require('../controllers/returnIncident');
const { requireSupervisorOrOperator, requireSupervisorOrAdmin } = require('../middlewares/auth');

// Devoluciones como incidencias (tipo RETURN). Montado con requireAuth en app.js.
// Alta interna (staff: supervisor / operador / admin) desde el detalle de envío.
router.get('/new',  requireSupervisorOrOperator, getCreateForm);
router.post('/new', requireSupervisorOrOperator, createInternal);

// Gestión de una devolución (supervisor / admin): tomar y resolver.
router.post('/:id/take',    requireSupervisorOrAdmin, take);
router.post('/:id/resolve', requireSupervisorOrAdmin, resolve);

module.exports = router;
