const express = require('express');
const router = express.Router();
const { requireSupervisorOrAdmin } = require('../middlewares/auth');
const ctrl = require('../controllers/fatigue');

// Panel de control de fatiga (supervisor/admin). RBAC reforzado en el controller (US-14).
router.get('/',                 requireSupervisorOrAdmin, ctrl.index);
router.get('/config',           requireSupervisorOrAdmin, ctrl.configPage);
router.post('/config',          requireSupervisorOrAdmin, ctrl.saveConfig);
router.post('/reassign',        requireSupervisorOrAdmin, ctrl.reassign);
router.post('/pattern/review',  requireSupervisorOrAdmin, ctrl.reviewPattern);
router.post('/purge',           requireSupervisorOrAdmin, ctrl.purge);
router.post('/:checkId/release', requireSupervisorOrAdmin, ctrl.release);
router.post('/:checkId/keep',    requireSupervisorOrAdmin, ctrl.keep);

module.exports = router;
