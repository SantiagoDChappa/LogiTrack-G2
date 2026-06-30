// Reportes financieros (lectura, sobre datos ya existentes de facturación):
//   - Ingresos por período (tendencia + ticket promedio + comparativa)
//   - Ingresos por concepto (desglose de qué genera la plata)
//   - Cobranzas / morosidad (aging de lo pendiente)
// Cada uno arma sus números y los pasa por reportNarrator para el resumen en lenguaje natural.
const { Op } = require('sequelize');
const { Invoice } = require('../models/invoice');
const { Shipment } = require('../models/shipment');
const branchModel = require('../models/branch');
const narrator = require('../services/reportNarrator');

// ── Scope por sucursal ──────────────────────────────────────────────────────────
// Admin (roleId 4) ve todas las sucursales; el supervisor sólo la suya. Igual criterio
// que el Panel de Cobranzas: se mapea cada factura a la sucursal de su envío.
async function loadScopedInvoices(query, viewer) {
    const isAdmin = viewer?.roleId === 4;
    const from = query.from || '';
    const to = query.to || '';

    const where = {};
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(`${from}T00:00:00`); }
        if (to)   { where.createdAt[Op.lte] = new Date(`${to}T23:59:59`); }
    }

    let invoices = await Invoice.findAll({ where });

    if (!isAdmin) {
        const myBranchId = viewer?.branchId || null;
        const shipmentIds = [...new Set(invoices.map(i => i.shipmentId))];
        const shipments = shipmentIds.length
            ? await Shipment.findAll({ where: { id: shipmentIds }, attributes: ['id', 'currentBranchId'] })
            : [];
        const branchByShipment = Object.fromEntries(shipments.map(s => [s.id, s.currentBranchId]));
        invoices = invoices.filter(i => (branchByShipment[i.shipmentId] || null) === myBranchId);
    }
    return { invoices, isAdmin, filters: { from, to } };
}

const isVoid = (inv) => inv.payStatus === 'ANULADA' || inv.voidedByCreditNoteId;

// Suma de montos facturados (excluye anuladas) en una ventana, respetando el scope.
async function sumInvoiced(fromDate, toDate, viewer) {
    const { invoices } = await loadScopedInvoices(
        { from: fromDate, to: toDate }, viewer
    );
    return invoices.filter(i => !isVoid(i)).reduce((a, i) => a + Number(i.amount || 0), 0);
}

// ── 1) Ingresos por período ──────────────────────────────────────────────────────
function dayKey(d)   { return d.toISOString().slice(0, 10); }                 // YYYY-MM-DD
function monthKey(d) { return d.toISOString().slice(0, 7); }                  // YYYY-MM
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const getIncomeByPeriod = async (req, res) => {
    const { invoices, filters } = await loadScopedInvoices(req.query, res.locals.currentUser);
    const live = invoices.filter(i => !isVoid(i));

    // Granularidad: día si el rango es corto (≤ 62 días) o no se sabe; mes si es largo.
    let granularity = 'day';
    if (filters.from && filters.to) {
        const days = (new Date(filters.to) - new Date(filters.from)) / 86400000;
        granularity = days > 62 ? 'month' : 'day';
    } else {
        granularity = 'month';
    }

    const groups = new Map();
    for (const inv of live) {
        const d = new Date(inv.createdAt);
        const key = granularity === 'month' ? monthKey(d) : dayKey(d);
        if (!groups.has(key)) { groups.set(key, { key, count: 0, total: 0 }); }
        const g = groups.get(key);
        g.count += 1; g.total += Number(inv.amount || 0);
    }
    const rows = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => {
        let label = g.key;
        if (granularity === 'month') { const [y, m] = g.key.split('-'); label = `${MONTHS[Number(m) - 1]} ${y}`; }
        return { ...g, label };
    });

    const total = live.reduce((a, i) => a + Number(i.amount || 0), 0);
    const count = live.length;
    const totals = { count, total, avgTicket: count > 0 ? total / count : 0 };
    const topPeriod = rows.length ? rows.reduce((a, b) => (b.total > a.total ? b : a)) : null;

    // Comparativa: ventana anterior del mismo largo (sólo si hay from+to).
    let prevTotal = null;
    if (filters.from && filters.to) {
        const f = new Date(filters.from), t = new Date(filters.to);
        const len = Math.max(1, Math.round((t - f) / 86400000) + 1);
        const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1);
        const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (len - 1));
        prevTotal = await sumInvoiced(dayKey(prevFrom), dayKey(prevTo), res.locals.currentUser);
    }

    const data = {
        rows, totals, prevTotal, filters, granularity,
        granularityLabel: granularity === 'month' ? 'mes' : 'día',
        topPeriod,
    };
    res.render('report/income-by-period', { ...data, narrative: narrator.incomeByPeriod(data) });
};

// ── 2) Ingresos por concepto ─────────────────────────────────────────────────────
const CONCEPTS = [
    { key: 'costBase',          label: 'Servicio base',        field: 'costBase' },
    { key: 'zoneBase',          label: 'Costo por zona',       field: 'zoneBase' },
    { key: 'weightSurcharge',   label: 'Adicional por peso',   field: 'weightSurcharge' },
    { key: 'volumeSurcharge',   label: 'Adicional por volumen', field: 'volumeSurcharge' },
    { key: 'insuranceAmount',   label: 'Seguro de mercadería', field: 'insuranceAmount' },
    { key: 'distanceSurcharge', label: 'Recargo por distancia', field: 'distanceSurcharge' },
    { key: 'expressSurcharge',  label: 'Recargo Express',      field: 'expressSurcharge' },
    { key: 'fragileSurcharge',  label: 'Recargo Frágil',       field: 'fragileSurcharge' },
];

const getIncomeByConcept = async (req, res) => {
    const { invoices, filters } = await loadScopedInvoices(req.query, res.locals.currentUser);
    const live = invoices.filter(i => !isVoid(i));

    const sums = Object.fromEntries(CONCEPTS.map(c => [c.key, 0]));
    let ivaTotal = 0, grandTotal = 0;
    for (const inv of live) {
        for (const c of CONCEPTS) { sums[c.key] += Number(inv[c.field] || 0); }
        // IVA = total − subtotal (el subtotal es la suma de conceptos netos).
        ivaTotal += Math.max(0, Number(inv.amount || 0) - Number(inv.subtotal || 0));
        grandTotal += Number(inv.amount || 0);
    }

    let concepts = CONCEPTS
        .map(c => ({ key: c.key, label: c.label, total: sums[c.key] }))
        .filter(c => c.total > 0);
    if (ivaTotal > 0) { concepts.push({ key: 'iva', label: 'IVA (21%)', total: ivaTotal }); }
    concepts = concepts
        .map(c => ({ ...c, pct: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0 }))
        .sort((a, b) => b.total - a.total);

    const data = { concepts, total: grandTotal, count: live.length, filters };
    res.render('report/income-by-concept', { ...data, narrative: narrator.incomeByConcept(data) });
};

// ── 3) Cobranzas / morosidad (aging) ─────────────────────────────────────────────
const AGING_BUCKETS = [
    { label: 'Al día (0-7 días)',   minDays: 0,  maxDays: 7 },
    { label: '8 a 30 días',         minDays: 8,  maxDays: 30 },
    { label: '31 a 60 días',        minDays: 31, maxDays: 60 },
    { label: 'Más de 60 días',      minDays: 61, maxDays: Infinity },
];

const getReceivablesAging = async (req, res) => {
    const { invoices, filters } = await loadScopedInvoices(req.query, res.locals.currentUser);
    // Pendientes = no pagadas y no anuladas.
    const pending = invoices.filter(i => i.payStatus === 'PENDIENTE' && !isVoid(i));

    const now = Date.now();
    const ageDays = (inv) => Math.floor((now - new Date(inv.createdAt).getTime()) / 86400000);

    const buckets = AGING_BUCKETS.map(b => ({ ...b, count: 0, total: 0 }));
    let totalPending = 0, oldestDays = 0, weightedAgeSum = 0;
    for (const inv of pending) {
        const age = ageDays(inv);
        const amount = Number(inv.amount || 0);
        const b = buckets.find(x => age >= x.minDays && age <= x.maxDays) || buckets[buckets.length - 1];
        b.count += 1; b.total += amount;
        totalPending += amount;
        weightedAgeSum += age * amount;
        if (age > oldestDays) { oldestDays = age; }
    }
    // DSO aproximado: edad promedio ponderada por monto de la deuda pendiente.
    const dso = totalPending > 0 ? Math.round(weightedAgeSum / totalPending) : 0;

    const data = { buckets, totalPending, oldestDays, dso, count: pending.length, filters };
    res.render('report/receivables-aging', { ...data, narrative: narrator.receivablesAging(data) });
};

module.exports = {
    loadScopedInvoices,
    sumInvoiced,
    getIncomeByPeriod,
    getIncomeByConcept,
    getReceivablesAging,
};
