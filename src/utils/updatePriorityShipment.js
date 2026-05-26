const cron = require('node-cron');
const { getActiveShipments } = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { Status, ShipmentPriority } = require('../constants/enums');

async function calculateUpdatePriority(shipmentId, priorityBase) {
    const history = await shipmentHistoryModel.getByShipmentId(shipmentId);
    let priority = priorityBase;

    if (!history || history.length === 0) {
        return priority;
    }

    const hasFailedOrIncident = history.some(h =>
        h.toStatusId === Status.FAILED_ATTEMPT.id ||
        h.toStatusId === Status.PACKAGE_FAILED.id
    );
    if (hasFailedOrIncident) {
        priority += 1;
    }

    const lastStatusChange = history.reduce(
        (latest, current) => new Date(current.changedAt) > new Date(latest.changedAt) ? current : latest,
        history[0]
    );

    const daysSinceLastChange = (new Date() - new Date(lastStatusChange.changedAt)) / (1000 * 60 * 60 * 24);
    if (daysSinceLastChange >= 7) {
        priority += 1;
    }

    if (priority > ShipmentPriority.URGENT.id) {
        priority = ShipmentPriority.URGENT.id;
    }

    return priority;
}

cron.schedule('0 0 * * *', async () => {
    try {
        const shipments = await getActiveShipments();
        for (const shipment of shipments) {
            const newPriority = await calculateUpdatePriority(shipment.id, shipment.basePriority);
            shipment.priority = newPriority;
            await shipment.save();
        }
    } catch (err) {
        console.error('cron updatePriority error:', err.message);
    }
});

module.exports = { calculateUpdatePriority, calcutaleUpdatePriority: calculateUpdatePriority };
