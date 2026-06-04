const { Op } = require('sequelize');
const { Shipment } = require('../models/shipment');
const { Status, NotificationEvent } = require('../constants/enums');

const TERMINAL_STATUS_IDS = [
    Status.DELIVERED.id,
    Status.CANCELLED.id,
    Status.PACKAGE_FAILED.id,
];

const processDelayedShipments = async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdue = await Shipment.findAll({
            where: {
                expectedDeliveryDate: { [Op.lt]: today },
                statusId: { [Op.notIn]: TERMINAL_STATUS_IDS },
                delayNotifiedAt: null,
            },
            attributes: ['id', 'trackingId', 'delayNotifiedAt'],
        });

        if (!overdue.length) {
            console.log('[delayDetectionJob] No hay envíos con demora pendientes de notificar.');
            return;
        }

        const { notifyShipmentEvent } = require('../controllers/shipment');

        for (const shipment of overdue) {
            await notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, shipment.id);
            await shipment.update({ delayNotifiedAt: new Date() });
        }

        console.log(`[delayDetectionJob] Notificaciones de demora enviadas: ${overdue.length}`);
    } catch (err) {
        console.error('[delayDetectionJob] Error:', err.message);
    }
};

module.exports = { processDelayedShipments };
