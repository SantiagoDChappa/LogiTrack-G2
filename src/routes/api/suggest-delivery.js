const express = require('express');
const router = express.Router();
const userModel = require('../../models/user');
const shipmentModel = require('../../models/shipment');
const { RoleType } = require('../../constants/enums');

router.get('/', async (req, res) => {
    try {
        const allDeliveryUsers = await userModel.search({ roleId: RoleType.DELIVERY.id });
        const shipments = await shipmentModel.getAll();
        const activeStatusIds = [1, 2, 3];

        const deliveryWithLoad = allDeliveryUsers.map(u => {
            const activeCount = shipments.filter(s =>
                activeStatusIds.includes(s.statusId) && s.deliveryUserId === u.id
            ).length;
            return { id: u.id, fullName: u.fullName, activeShipments: activeCount };
        });

        // Ordenar por menor carga
        deliveryWithLoad.sort((a, b) => a.activeShipments - b.activeShipments);

        res.json({
            suggested: deliveryWithLoad[0] || null,
            all: deliveryWithLoad
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;