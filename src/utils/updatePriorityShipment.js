const cron = require('node-cron');
const { Shipment } = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { Status, ShipmentPriority } = require('../constants/enums');

async function calcutaleUpdatePriority(shipmentId, priorityBase) {

    let history = await shipmentHistoryModel.getByShipmentId(shipmentId);
    let priority = priorityBase;

    if (history.contains(
        h => h.toStatusId === Status.DELIVERY_FAILED.id
            || h.toStatusId === Status.PACKAGE_INCIDENT.id)) {
        priority += 1;
    }

    const lastStatusChange = history.reduce(
        (latest, current) => { return new Date(current.changedAt) >
        new Date(latest.changedAt)? current: latest;});

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
    const shipments = await Shipment.getActiveShipments();

    for (const shipment of shipments) {
        const newPriority = await calcutaleUpdatePriority(shipment.id, shipment.basePriority);
        shipment.priority = newPriority;
        await shipment.save();
    }
});
