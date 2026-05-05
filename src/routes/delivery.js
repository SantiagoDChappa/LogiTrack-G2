const express = require('express');
const router = express.Router();
const { requireAuth, requireDelivery } = require('../middlewares/auth');
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
    requireAuth,
    requireDelivery,
    deliveryController.showActionScreen
);

router.get('/evidence/:id/pod',
    requireAuth,
    requireDelivery,
    deliveryController.showEvidenceForm
);

router.post('/evidence/:id/pod',
    requireAuth,
    requireDelivery,
    deliveryController.saveEvidence
);

module.exports = router;