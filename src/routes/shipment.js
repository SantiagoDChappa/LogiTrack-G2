const express = require('express');
const router = express.Router();
const { home, getDetail, getNewShipmentForm, createShipment, getUpdateShipment, updateShipment, updateShipmentStatus, searchShipments, assignDelivery } = require('../controllers/shipment.js');
const { validateShipment, validateUpdateShipment, handleUpdateValidationErrors } = require('../middlewares/shipment.js');
const { requireSupervisor, requireSupervisorOrOperator } = require('../middlewares/auth.js');

router.get('/', home);
router.get('/search', searchShipments);
router.get('/new', getNewShipmentForm);
router.post('/new', validateShipment, createShipment);
router.get('/detail/:id', getDetail);
router.get('/update/:id', getUpdateShipment);
router.post('/update/:id', validateUpdateShipment, handleUpdateValidationErrors, updateShipment);
router.post('/update/:id/status', requireSupervisorOrOperator, updateShipmentStatus);
router.post('/update/:id/assign', requireSupervisor, assignDelivery);

module.exports = router;
