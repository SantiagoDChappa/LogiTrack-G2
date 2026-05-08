const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/route');

router.get('/',                  ctrl.list);
router.get('/optimize',          ctrl.optimizeForm);
router.post('/optimize/preview', ctrl.previewOptimization);
router.post('/confirm',          ctrl.confirm);
router.get('/:id',               ctrl.detail);

module.exports = router;
