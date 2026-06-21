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

module.exports = router;
