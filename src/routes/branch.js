const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middlewares/auth');
const ctrl = require('../controllers/branch');

// ABM de sucursales — solo admin. Montado con requireAuth en app.js.
router.get('/',             requireAdmin, ctrl.getIndex);
router.get('/new',          requireAdmin, ctrl.getNewForm);
router.post('/',            requireAdmin, ctrl.create);
router.get('/:id/edit',     requireAdmin, ctrl.getEditForm);
router.post('/:id/closed',  requireAdmin, ctrl.setClosed);
router.post('/:id',         requireAdmin, ctrl.update);

module.exports = router;
