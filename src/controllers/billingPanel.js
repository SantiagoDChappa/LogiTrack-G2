// Panel de Cobranzas: facturado vs. cobrado vs. pendiente, agrupado por sucursal.
// Reusa la misma fuente de datos que el Centro de Facturación, pero agregada.
const { Op } = require('sequelize');
const { Invoice } = require('../models/invoice');
const { Shipment } = require('../models/shipment');
const { Branch } = require('../models/branch');
const branchModel = require('../models/branch');

const buildBillingPanelData = async (query) => {
    const from = query.from || '';
    const to = query.to || '';

    const where = {};
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(`${from}T00:00:00`); }
        if (to)   { where.createdAt[Op.lte] = new Date(`${to}T23:59:59`); }
    }

    const [invoices, branches] = await Promise.all([
        Invoice.findAll({ where }),
        branchModel.getAll().catch(() => []),
    ]);

    const shipmentIds = [...new Set(invoices.map(i => i.shipmentId))];
    const shipments = shipmentIds.length
        ? await Shipment.findAll({ where: { id: shipmentIds }, attributes: ['id', 'currentBranchId'] })
        : [];
    const branchByShipment = Object.fromEntries(shipments.map(s => [s.id, s.currentBranchId]));
    const branchNameById = Object.fromEntries(branches.map(b => [b.id, b.name]));

    // Acumuladores por sucursal (null = "Sin sucursal").
    const buckets = new Map();
    const bucketFor = (branchId) => {
        const key = branchId || 0;
        if (!buckets.has(key)) {
            buckets.set(key, {
                branchId: branchId || null,
                branchName: branchId ? (branchNameById[branchId] || `#${branchId}`) : 'Sin sucursal',
                facturado: 0, cobrado: 0, pendiente: 0, anulado: 0, cantidad: 0,
            });
        }
        return buckets.get(key);
    };

    for (const inv of invoices) {
        const branchId = branchByShipment[inv.shipmentId] || null;
        const b = bucketFor(branchId);
        const amount = Number(inv.amount || 0);
        b.facturado += amount;
        b.cantidad += 1;
        if (inv.payStatus === 'PAGADA') { b.cobrado += amount; }
        else if (inv.payStatus === 'ANULADA') { b.anulado += amount; }
        else { b.pendiente += amount; }
    }

    const rows = [...buckets.values()]
        .map(b => ({ ...b, pctCobrado: b.facturado > 0 ? Math.round((b.cobrado / b.facturado) * 100) : 0 }))
        .sort((a, b) => b.facturado - a.facturado);

    const totals = rows.reduce((acc, r) => ({
        facturado: acc.facturado + r.facturado,
        cobrado:   acc.cobrado + r.cobrado,
        pendiente: acc.pendiente + r.pendiente,
        anulado:   acc.anulado + r.anulado,
        cantidad:  acc.cantidad + r.cantidad,
    }), { facturado: 0, cobrado: 0, pendiente: 0, anulado: 0, cantidad: 0 });
    totals.pctCobrado = totals.facturado > 0 ? Math.round((totals.cobrado / totals.facturado) * 100) : 0;

    return { rows, totals, filters: { from, to } };
};

const getBillingPanel = async (req, res) => {
    const data = await buildBillingPanelData(req.query);
    res.render('report/billingPanel', data);
};

module.exports = { getBillingPanel, buildBillingPanelData };
