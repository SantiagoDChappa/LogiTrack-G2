const express           = require('express');
const router            = express.Router();
const settingController = require('../controllers/setting');

router.get('/',              settingController.getSettings);
router.post('/',             settingController.saveSettings);
router.post('/assign-branch', settingController.assignBranch);

module.exports = router;
