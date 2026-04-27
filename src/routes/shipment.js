const express = require('express');
const router = express.Router();
const { home, getDetail, getNewShipmentForm, createShipment, getUpdateShipment, updateShipment, updateShipmentStatus, searchShipments } = require('../controllers/shipment.js');
const { validateShipment, validateUpdateShipment, handleUpdateValidationErrors, existShipmentDelivery} = require('../middlewares/shipment.js');

const deliveredValidation = require('../validations/deliveredValidation.js');
const validationFields = require('../middlewares/validationResult.js');

const { requireSupervisor } = require('../middlewares/auth.js');

router.get('/', home);
router.get('/search', searchShipments);
router.get('/new', getNewShipmentForm);
//router.post('/new', validateShipment, handleValidationErrors, createShipment);
router.post('/new', validateShipment, createShipment);
router.get('/detail/:id', getDetail);
router.get('/update/:id', getUpdateShipment);

//router.post('/delivery', deliveredValidation, validationFields, deliveredShipment);
//router.get('/delivery/:id', existShipmentDelivery, getShipmentDelivery);

/*router.post('/update/:id', validateUpdateShipment, handleUpdateValidationErrors, updateShipment);*/
router.post('/update/:id', validateUpdateShipment, handleUpdateValidationErrors, updateShipment);
router.post('/update/:id/status', requireSupervisor, updateShipmentStatus);

module.exports = router;
