const shipmentModel = require('../models/shipment');

const getIndex = async (req, res) => {
    if (req.user && req.user.roleId === 3) return res.redirect('/delivery');

    const shipments = await shipmentModel.getAll();

    const normalizeStatus = (s) => s.status.description.toLowerCase().replace(/[\s-]+/g, '_');

    const activeShipments  = shipments.filter(s => normalizeStatus(s) === 'en_transito').length;
    const deliveriesToday  = shipments.filter(s => normalizeStatus(s) === 'entregado').length;
    const delayAlerts      = shipments.filter(s => normalizeStatus(s) === 'retrasado').length;
    const newRecords       = shipments.length;

    const lastActivity = shipments.slice(-5).reverse();

    res.render('dashboard', { activeShipments, deliveriesToday, delayAlerts, newRecords, lastActivity });
};

module.exports = { getIndex };
