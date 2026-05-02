const shipmentModel = require('../models/shipment');
const userModel = require('../models/user');
const { RoleType } = require('../constants/enums');

const getIndex = async (req, res) => {
    if (req.user && req.user.roleId === 3) { return res.redirect('/delivery'); }

    const shipments = await shipmentModel.getAll();

    const normalizeStatus = (s) => s.status.description.toLowerCase().replace(/[\s-]+/g, '_');

    const activeShipments = shipments.filter(s => normalizeStatus(s) === 'en_transito').length;
    const deliveriesToday = shipments.filter(s => normalizeStatus(s) === 'entregado').length;
    const delayAlerts     = shipments.filter(s => normalizeStatus(s) === 'retrasado').length;
    const newRecords      = shipments.length;
    const lastActivity    = shipments.slice(-5).reverse();

    // Total por estado
    const statusMap = {};
    shipments.forEach(s => {
        const key   = normalizeStatus(s);
        const label = s.status.description;
        if (!statusMap[key]) { statusMap[key] = { key, label, total: 0 }; }
        statusMap[key].total++;
    });
    const statusTotals = Object.values(statusMap);

    // Repartidores ocupados y disponibles
    const activeStatusIds = [1, 2, 3];

    const allDeliveryUsers = await userModel.search({ roleId: RoleType.DELIVERY.id });

    const busyDeliveryUsers = allDeliveryUsers.map(u => {
        const assignedShipments = shipments.filter(s =>
            activeStatusIds.includes(s.statusId) && s.deliveryUserId === u.id
        );
        return {
            id: u.id,
            fullName: u.fullName,
            shipmentCount: assignedShipments.length
        };
    }).filter(u => u.shipmentCount > 0);

    const availableDeliveryUsers = allDeliveryUsers
        .filter(u => !busyDeliveryUsers.find(b => b.id === u.id))
        .map(u => ({ id: u.id, fullName: u.fullName }));

    res.render('dashboard', {
        activeShipments, deliveriesToday, delayAlerts, newRecords, lastActivity,
        statusTotals,
        busyDeliveryUsers,
        availableDeliveryUsers
    });
};

module.exports = { getIndex };