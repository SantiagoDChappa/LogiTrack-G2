const shipmentModel = require('../models/shipment');
const userModel = require('../models/user');
const historyModel = require('../models/shipmentHistory');
const { RoleType } = require('../constants/enums');
const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');

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

    // Heatmap: puntos de entrega de envios pendientes/en transito (lat/lng)
    const heatmapPoints = await sequelize.query(
        `SELECT a.lat::float AS lat, a.lng::float AS lng
           FROM logitrack.shipment s
           JOIN logitrack.address a ON a.id = s."addressId"
          WHERE s."statusId" IN (1,2,3,6,7) AND a.lat IS NOT NULL AND a.lng IS NOT NULL`,
        { type: QueryTypes.SELECT }
    );

    // Saturacion por sucursal: pendientes por branch
    const branchSaturation = await sequelize.query(
        `SELECT b.id, b.name, COUNT(s.id)::int AS pending
           FROM logitrack.branch b
           LEFT JOIN logitrack.shipment s
             ON s."currentBranchId" = b.id AND s."statusId" IN (1,3,7)
          GROUP BY b.id, b.name
         HAVING COUNT(s.id) > 0
          ORDER BY pending DESC
          LIMIT 12`,
        { type: QueryTypes.SELECT }
    );

    res.render('dashboard', {
        activeShipments, deliveriesToday, delayAlerts, newRecords, lastActivity,
        statusTotals,
        busyDeliveryUsers,
        availableDeliveryUsers,
        deliveriesByDay,
        heatmapPoints,
        branchSaturation,
    });
};

module.exports = { getIndex };