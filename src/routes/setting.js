const express           = require('express');
const router            = express.Router();
const settingController = require('../controllers/setting');
const { requireAdmin }  = require('../middlewares/auth');

router.get('/',              requireAdmin, settingController.getSettings);
router.post('/',             requireAdmin, settingController.saveSettings);
router.post('/assign-branch', requireAdmin, settingController.assignBranch);
router.post('/route-optimizer', requireAdmin, settingController.saveRouteOptimizerSettings);
router.post('/params',          requireAdmin, settingController.saveParams);
router.post('/notification-config',         requireAdmin, settingController.saveNotificationConfig);
router.post('/email-template/:eventCode',   requireAdmin, settingController.saveEmailTemplate);
router.post('/test-email-override',         requireAdmin, settingController.saveTestEmailOverride);
// Sprint 3 - 2.5 parámetros configurables nuevos
router.post('/failed-reason',          requireAdmin, settingController.saveFailedReason);
router.post('/failed-reason/:id',      requireAdmin, settingController.saveFailedReason);
router.post('/standard-message/:code', requireAdmin, settingController.saveStandardMessage);
router.post('/time-window',            requireAdmin, settingController.saveTimeWindow);
router.post('/time-window/:id',        requireAdmin, settingController.saveTimeWindow);
router.post('/incident-type',          requireAdmin, settingController.saveIncidentType);
router.post('/incident-type/:id',      requireAdmin, settingController.saveIncidentType);

module.exports = router;
