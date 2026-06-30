const express = require('express');
const router = express.Router();
const { requireAdmin, requireSupervisorOrOperator } = require('../middlewares/auth');
const ctrl = require('../controllers/branch');

// Retiro en sucursal: el operador/supervisor escanea el QR o tipea el código para confirmar
// la entrega. Va ANTES de las rutas ABM para no chocar con '/:id'. El scope por sucursal lo
// valida pickupCode.service (sólo confirma retiros de la sucursal del operador).
router.get('/pickup',          requireSupervisorOrOperator, ctrl.getPickupScanner);
router.post('/pickup/confirm', requireSupervisorOrOperator, ctrl.postPickupConfirm);

// ABM de sucursales — solo admin. Montado con requireAuth en app.js.
router.get('/',             requireAdmin, ctrl.getIndex);
router.get('/new',          requireAdmin, ctrl.getNewForm);
router.post('/',            requireAdmin, ctrl.create);
router.get('/:id/edit',     requireAdmin, ctrl.getEditForm);
router.post('/:id/closed',  requireAdmin, ctrl.setClosed);
router.post('/:id',         requireAdmin, ctrl.update);

module.exports = router;
