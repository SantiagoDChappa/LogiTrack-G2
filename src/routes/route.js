const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/route');

router.get('/',                  ctrl.list);
router.get('/optimize',          ctrl.optimizeForm);
router.post('/optimize/preview', ctrl.previewOptimization);
router.post('/optimize/recalc',  ctrl.recalcManual);
router.post('/confirm',          ctrl.confirm);
router.post('/confirm-one',      ctrl.confirmOne);
router.get('/scan/:id',          ctrl.getScanPage);
router.post('/scan/:id/dispatch', ctrl.dispatchRoute);
router.get('/:id/qr',            ctrl.getQR);
router.post('/:id/revert',       ctrl.revertRoute);
router.post('/:id/append',       ctrl.appendToRoute);
router.get('/:id',               ctrl.detail);

module.exports = router;
