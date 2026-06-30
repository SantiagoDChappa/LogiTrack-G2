// Listado de todas las notas de crédito (reembolsos), con filtros por fecha,
// sucursal y cliente. Igual idea que el Centro de Facturación pero para NCs.
const { Op } = require('sequelize');
const { CreditNote } = require('../models/creditNote');
const { Shipment } = require('../models/shipment');
const { Branch } = require('../models/branch');
const branchModel = require('../models/branch');

const buildCreditNoteCenterData = async (query, viewer) => {
    const isAdmin = viewer?.roleId === 4;
    const from = query.from || '';
    const to = query.to || '';
    // Supervisor: forzado a su propia sucursal, no puede ver las demás.
    const branchId = isAdmin ? (query.branchId || '') : String(viewer?.branchId || '');
    const q = String(query.q || '').trim();

    const where = {};
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(`${from}T00:00:00`); }
        if (to)   { where.createdAt[Op.lte] = new Date(`${to}T23:59:59`); }
    }

    const [creditNotes, branches] = await Promise.all([
        CreditNote.findAll({ where, order: [['createdAt', 'DESC']] }),
        branchModel.getAll().catch(() => []),
    ]);

    const shipmentIds = [...new Set(creditNotes.map(c => c.shipmentId))];
    const shipments = shipmentIds.length
        ? await Shipment.findAll({
            where: { id: shipmentIds },
            attributes: ['id', 'trackingId', 'currentBranchId'],
            include: [{ model: Branch, as: 'currentBranch', attributes: ['id', 'name'], required: false }],
        })
        : [];
    const shipmentMap = Object.fromEntries(shipments.map(s => [s.id, s]));

    let rows = creditNotes.map(cn => {
        const sh = shipmentMap[cn.shipmentId];
        return {
            id: cn.id,
            number: cn.number,
            shipmentId: cn.shipmentId,
            trackingId: sh ? sh.trackingId : null,
            branchId: sh ? sh.currentBranchId : null,
            branchName: (sh && sh.currentBranch) ? sh.currentBranch.name : '—',
            senderName: cn.senderName || '—',
            senderDocument: cn.senderDocument || '—',
            amount: cn.amount,
            motivo: cn.incidentId ? 'Incidencia' : (cn.returnId ? 'Devolución' : '—'),
            createdAt: cn.createdAt,
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

    return { rows, branches, filters: { from, to, branchId, q }, isAdmin };
};

const getCreditNoteCenter = async (req, res) => {
    const data = await buildCreditNoteCenterData(req.query, res.locals.currentUser);
    data.narrative = require('../services/reportNarrator').creditNoteCenter(data);
    res.render('report/creditNotes', data);
};

const exportCreditNoteCenter = async (req, res) => {
    try {
        const data = await buildCreditNoteCenterData(req.query, res.locals.currentUser);
        const rows = [['Nota de crédito', 'Envío', 'Cliente', 'Documento', 'Sucursal', 'Monto', 'Motivo', 'Fecha']];
        for (const r of data.rows) {
            rows.push([r.number, r.trackingId || '—', r.senderName, r.senderDocument, r.branchName, r.amount, r.motivo, new Date(r.createdAt).toLocaleString('es-AR')]);
        }
        const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const filename = `notas_credito_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (err) {
        console.error('exportCreditNoteCenter:', err.message);
        res.status(500).send('Error al exportar');
    }
};

module.exports = { getCreditNoteCenter, exportCreditNoteCenter };
