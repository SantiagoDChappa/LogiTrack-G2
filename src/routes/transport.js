const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transport');

router.get('/',           ctrl.list);
router.get('/new',        ctrl.newForm);
router.post('/new',       ctrl.create);
router.get('/update/:id', ctrl.updateForm);
router.post('/update/:id', ctrl.update);
router.post('/toggle/:id', ctrl.toggleEnabled);
router.get('/stats/:id',   ctrl.stats);

module.exports = router;
