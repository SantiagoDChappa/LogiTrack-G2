const shipmentModel = require('../models/shipment');

const getIndex = async (req, res) => {
    if (req.user && req.user.roleId === 3) { return res.redirect('/delivery'); }


    const shipments = await shipmentModel.getAll();

    const normalizeStatus = (s) => s.status.description.toLowerCase().replace(/[\s-]+/g, '_');
    const statusLabels = {
        pendiente:   'Pendiente',
        en_transito: 'En Transito',
        en_sucursal: 'En Sucursal',
        entregado:   'Entregado',
        cancelado:   'Cancelado',
        cancelada:   'Cancelada',
        retrasado:   'Retrasado',
        inicial:     'Inicial',
    };

    const activeShipments  = shipments.filter(s => normalizeStatus(s) === 'en_transito').length;
    const deliveriesToday  = shipments.filter(s => normalizeStatus(s) === 'entregado').length;
    const delayAlerts      = shipments.filter(s => normalizeStatus(s) === 'retrasado').length;
    const newRecords       = shipments.length;
    const shipmentsByStatus = shipments.reduce((acc, shipment) => {
        const key = normalizeStatus(shipment);
        if (!acc[key]) {
            acc[key] = {
                key,
                label: statusLabels[key] || shipment.status.description,
                total: 0,
            };
        }
        acc[key].total += 1;
        return acc;
    }, {});

    const statusTotals = Object.values(shipmentsByStatus)
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    const lastActivity = shipments.slice(-5).reverse();

    res.render('dashboard', { activeShipments, deliveriesToday, delayAlerts, newRecords, statusTotals, lastActivity });
};

module.exports = { getIndex };
