const express           = require('express');
const router            = express.Router();
const settingController = require('../controllers/setting');
const { requireAdmin }  = require('../middlewares/auth');

router.get('/',              requireAdmin, settingController.getSettings);
router.post('/',             requireAdmin, settingController.saveSettings);
router.post('/assign-branch', requireAdmin, settingController.assignBranch);
router.post('/route-optimizer', requireAdmin, settingController.saveRouteOptimizerSettings);
router.post('/params',          requireAdmin, settingController.saveParams);

module.exports = router;
