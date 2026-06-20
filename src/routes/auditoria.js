const express = require('express');
const router = express.Router();
const { getResumen, getUsuariosActivos, getSesiones, getAcciones, getConfiguracion, exportCsv } = require('../controllers/auditoria');
const { requireAdmin } = require('../middlewares/auth');

router.get('/',                 requireAdmin, getResumen);
router.get('/usuarios-activos', requireAdmin, getUsuariosActivos);
router.get('/sesiones',         requireAdmin, getSesiones);
router.get('/acciones',         requireAdmin, getAcciones);
router.get('/configuracion',    requireAdmin, getConfiguracion);
router.get('/export-csv',       requireAdmin, exportCsv);

module.exports = router;
