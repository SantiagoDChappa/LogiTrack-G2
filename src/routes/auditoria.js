const express = require('express');
const router = express.Router();
const { getResumen, getSeguridad, getUsuariosActivos, getSesiones, getAcciones, getConfiguracion, exportCsv, exportResumenCsv, unblockIp, addWhitelistedIp, removeWhitelistedIp } = require('../controllers/auditoria');
const { requireAdmin } = require('../middlewares/auth');

router.get('/',                        requireAdmin, getResumen);
router.get('/resumen/export-csv',      requireAdmin, exportResumenCsv);
router.get('/seguridad',               requireAdmin, getSeguridad);
router.get('/usuarios-activos',        requireAdmin, getUsuariosActivos);
router.get('/sesiones',                requireAdmin, getSesiones);
router.get('/acciones',                requireAdmin, getAcciones);
router.get('/configuracion',           requireAdmin, getConfiguracion);
router.get('/export-csv',              requireAdmin, exportCsv);
router.post('/blocked-ip/:id/unblock', requireAdmin, unblockIp);
router.post('/whitelist-ip',           requireAdmin, addWhitelistedIp);
router.post('/whitelist-ip/:id/remove', requireAdmin, removeWhitelistedIp);

module.exports = router;
