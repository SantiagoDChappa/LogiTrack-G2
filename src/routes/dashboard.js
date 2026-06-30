const express = require('express');
const router = express.Router();
const { getDashboardOperaciones, getDashboardDesempeno } = require('../controllers/dashboard');

router.get('/operaciones', getDashboardOperaciones);
router.get('/desempeno',   getDashboardDesempeno);

module.exports = router;
