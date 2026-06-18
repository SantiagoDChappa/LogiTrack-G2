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
    getFailedAttemptsByZone,
    getPeriodComparison,
    getDashboardSupervisor,
    getDashboardAdmin,
    getDashboardOwner,
} = require('../controllers/report');

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

// Sprint 5 — nuevos reportes operativos
router.get('/failed-attempts-by-zone', getFailedAttemptsByZone);
router.get('/period-comparison', getPeriodComparison);

// Sprint 5 — dashboards analíticos por perfil
router.get('/dashboard/supervisor', getDashboardSupervisor);
router.get('/dashboard/admin', getDashboardAdmin);
router.get('/dashboard/owner', getDashboardOwner);

module.exports = router;
