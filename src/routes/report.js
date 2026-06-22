const express = require('express');
const router = express.Router();
const {
    getShipmentsByPeriod,
    getOnTimeDeliveries,
    getDeliveryPerformance,
    getIncidentsByPeriod,
    getSatisfactionReport,
    exportShipmentsByPeriod,
    exportOnTimeDeliveries,
    exportDeliveryPerformance,
    exportIncidentsByPeriod,
    exportSatisfactionReport,
    getDashboardSupervisor,
    getDashboardAdmin,
    getDashboardOwner,
} = require('../controllers/report');
const { getUsersReport, exportUsersReport } = require('../controllers/userReport');
const { requireAdmin } = require('../middlewares/auth');

router.get('/shipments-by-period', getShipmentsByPeriod);
router.get('/shipments-by-period/export', exportShipmentsByPeriod);
router.get('/on-time-deliveries', getOnTimeDeliveries);
router.get('/on-time-deliveries/export', exportOnTimeDeliveries);
router.get('/delivery-performance', getDeliveryPerformance);
router.get('/delivery-performance/export', exportDeliveryPerformance);
router.get('/incidents-by-period', getIncidentsByPeriod);
router.get('/incidents-by-period/export', exportIncidentsByPeriod);
router.get('/satisfaction', getSatisfactionReport);
router.get('/satisfaction/export', exportSatisfactionReport);

// Reporte de usuarios: solo Administrador (historial de cuentas + actividad).
router.get('/users', requireAdmin, getUsersReport);
router.get('/users/export', requireAdmin, exportUsersReport);

// Sprint 5 — dashboards analíticos por perfil
router.get('/dashboard/supervisor', getDashboardSupervisor);
router.get('/dashboard/admin', getDashboardAdmin);
router.get('/dashboard/owner', getDashboardOwner);

module.exports = router;
