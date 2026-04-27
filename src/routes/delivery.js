const express = require('express');
const router = express.Router();
const { requireDelivery } = require('../middlewares/auth');
const shipmentModel = require('../models/shipment');

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

module.exports = router;