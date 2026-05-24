const express = require('express');
const router = express.Router();
const { getShipmentsByPeriod, getOnTimeDeliveries, getDeliveryPerformance } = require('../controllers/report');

router.get('/shipments-by-period', getShipmentsByPeriod);
router.get('/on-time-deliveries', getOnTimeDeliveries);
router.get('/delivery-performance', getDeliveryPerformance);

module.exports = router;
