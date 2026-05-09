const shipmentModel = require('../models/shipment');
const userModel = require('../models/user');
const historyModel = require('../models/shipmentHistory');
const { RoleType } = require('../constants/enums');

const getIndex = async (req, res) => {
    if (req.user && req.user.roleId === 3) { return res.redirect('/delivery'); }

    const shipments = await shipmentModel.getAll();

    const normalizeStatus = (s) => s.status.description.toLowerCase().replace(/[\s-]+/g, '_');

    const activeShipments = shipments.filter(s => normalizeStatus(s) === 'en_transito').length;
    const deliveriesToday = shipments.filter(s => normalizeStatus(s) === 'entregado').length;
    const delayAlerts     = shipments.filter(s => normalizeStatus(s) === 'retrasado').length;
    const newRecords      = shipments.length;
    const lastActivity    = [...shipments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);

    // Total por estado
    const statusMap = {};
    shipments.forEach(s => {
        const key   = normalizeStatus(s);
        const label = s.status.description;
        if (!statusMap[key]) { statusMap[key] = { key, label, total: 0, id: s.statusId }; }
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

    // Entregas completadas por día (últimos 7 días)
    const allHistory = await historyModel.ShipmentHistory.findAll({
        where: { toStatusId: 4 }
    });

    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    const deliveriesByDay = last7Days.map(date => {
        const count = allHistory.filter(h => {
            return h.changedAt.toISOString().split('T')[0] === date;
        }).length;
        return { date, count };
    });

    res.render('dashboard', {
        activeShipments, deliveriesToday, delayAlerts, newRecords, lastActivity,
        statusTotals,
        busyDeliveryUsers,
        availableDeliveryUsers,
        deliveriesByDay
    });
};

module.exports = { getIndex };