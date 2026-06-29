// Centro de Facturación: listado de todas las facturas del sistema, con filtros
// por fecha, estado de cobro, sucursal y cliente. La factura no tiene sucursal
// propia — se resuelve a través del envío (currentBranchId al momento de mirar).
const { Op } = require('sequelize');
const { Invoice } = require('../models/invoice');
const { Shipment } = require('../models/shipment');
const { Branch } = require('../models/branch');
const branchModel = require('../models/branch');

const PAY_STATUS_LABELS = { PENDIENTE: 'Pendiente de cobro', PAGADA: 'Cobrada', ANULADA: 'Anulada' };

const buildInvoiceCenterData = async (query, viewer) => {
    const isAdmin = viewer?.roleId === 4;
    const from = query.from || '';
    const to = query.to || '';
    const payStatus = query.payStatus || '';
    // Supervisor: forzado a su propia sucursal, no puede ver las demás.
    const branchId = isAdmin ? (query.branchId || '') : String(viewer?.branchId || '');
    const q = String(query.q || '').trim();

    const where = {};
    if (payStatus) { where.payStatus = payStatus; }
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(`${from}T00:00:00`); }
        if (to)   { where.createdAt[Op.lte] = new Date(`${to}T23:59:59`); }
    }

    const [invoices, branches] = await Promise.all([
        Invoice.findAll({ where, order: [['createdAt', 'DESC']] }),
        branchModel.getAll().catch(() => []),
    ]);

    const shipmentIds = [...new Set(invoices.map(i => i.shipmentId))];
    const shipments = shipmentIds.length
        ? await Shipment.findAll({
            where: { id: shipmentIds },
            attributes: ['id', 'trackingId', 'currentBranchId'],
            include: [{ model: Branch, as: 'currentBranch', attributes: ['id', 'name'], required: false }],
        })
        : [];
    const shipmentMap = Object.fromEntries(shipments.map(s => [s.id, s]));

    let rows = invoices.map(inv => {
        const sh = shipmentMap[inv.shipmentId];
        return {
            id: inv.id,
            number: inv.number,
            shipmentId: inv.shipmentId,
            trackingId: sh ? sh.trackingId : null,
            branchId: sh ? sh.currentBranchId : null,
            branchName: (sh && sh.currentBranch) ? sh.currentBranch.name : '—',
            senderName: inv.senderName || '—',
            senderDocument: inv.senderDocument || '—',
            amount: inv.amount,
            payStatus: inv.payStatus,
            payStatusLabel: PAY_STATUS_LABELS[inv.payStatus] || inv.payStatus,
            payMethod: inv.payMethod,
            createdAt: inv.createdAt,
            paidAt: inv.paidAt,
        };
    });

    if (branchId) { rows = rows.filter(r => String(r.branchId) === String(branchId)); }
    if (q) {
        const qLower = q.toLowerCase();
        rows = rows.filter(r =>
            r.senderName.toLowerCase().includes(qLower)
            || r.senderDocument.includes(q)
            || (r.trackingId || '').toLowerCase().includes(qLower)
            || r.number.toLowerCase().includes(qLower));
    }

    return { rows, branches, filters: { from, to, payStatus, branchId, q }, isAdmin };
};

const getInvoiceCenter = async (req, res) => {
    const data = await buildInvoiceCenterData(req.query, res.locals.currentUser);
    res.render('report/invoices', { ...data, payStatusOptions: PAY_STATUS_LABELS });
};

const exportInvoiceCenter = async (req, res) => {
    try {
        const data = await buildInvoiceCenterData(req.query, res.locals.currentUser);
        const rows = [['Factura', 'Envío', 'Cliente', 'Documento', 'Sucursal', 'Monto', 'Estado', 'Medio de pago', 'Fecha', 'Fecha de pago']];
        for (const r of data.rows) {
            rows.push([
                r.number,
                r.trackingId || '—',
                r.senderName,
                r.senderDocument,
                r.branchName,
                r.amount,
                r.payStatusLabel,
                r.payMethod || '—',
                new Date(r.createdAt).toLocaleString('es-AR'),
                r.paidAt ? new Date(r.paidAt).toLocaleString('es-AR') : '—',
            ]);
        }
        const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const filename = `facturacion_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (err) {
        console.error('exportInvoiceCenter:', err.message);
        res.status(500).send('Error al exportar');
    }
};

module.exports = { getInvoiceCenter, exportInvoiceCenter };
