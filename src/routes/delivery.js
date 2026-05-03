const express = require('express');
const router = express.Router();
const { requireDelivery } = require('../middlewares/auth');
const shipmentModel = require('../models/shipment');
const deliveryController = require('../controllers/delivery');

router.get('/', requireDelivery, async (req, res) => {
    try {
        const userId = res.locals.currentUser.id;
        const shipments = await shipmentModel.search({ 
            deliveryUserId: userId 
        });
        res.render('delivery/home', { shipments });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.get('/evidence/:id',
    requireDelivery,
    deliveryController.showEvidenceForm
);

router.post('/evidence/:id',
    requireDelivery,
    deliveryController.saveEvidence
);

module.exports = router;