// Módulo de gastos: ABM simple (alta/baja) + reporte de resultado neto del período
// (ingresos facturados − notas de crédito − gastos). Una sola página hace de carga y reporte.
const { Op } = require('sequelize');
const { Expense, CATEGORIES } = require('../models/expense');
const { CreditNote } = require('../models/creditNote');
const branchModel = require('../models/branch');
const narrator = require('../services/reportNarrator');
const { sumInvoiced } = require('./financeReports');

function dateWindow(query) {
    const from = query.from || '';
    const to = query.to || '';
    const where = {};
    if (from || to) {
        where.incurredOn = {};
        if (from) { where.incurredOn[Op.gte] = from; }
        if (to)   { where.incurredOn[Op.lte] = to; }
    }
    return { from, to, where };
}

const getExpensesReport = async (req, res) => {
    const viewer = res.locals.currentUser;
    const isAdmin = viewer?.roleId === 4;
    const { from, to, where } = dateWindow(req.query);

    // Scope: el supervisor sólo ve los gastos de su sucursal (incluye los sin sucursal).
    if (!isAdmin) {
        where.branchId = { [Op.or]: [viewer?.branchId || null, null] };
    }

    const [expenses, branches] = await Promise.all([
        Expense.findAll({ where, order: [['incurredOn', 'DESC'], ['id', 'DESC']] }),
        branchModel.getAll().catch(() => []),
    ]);
    const branchNameById = Object.fromEntries(branches.map(b => [b.id, b.name]));

    // Agregados de gastos por categoría.
    const catMap = new Map();
    let totalExpenses = 0;
    for (const e of expenses) {
        const amt = Number(e.amount || 0);
        totalExpenses += amt;
        catMap.set(e.category, (catMap.get(e.category) || 0) + amt);
    }
    const byCategory = [...catMap.entries()]
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);

    // Ingresos del período (facturado neto de anuladas) y notas de crédito (egreso).
    const income = await sumInvoiced(from, to, viewer);
    const cnWhere = {};
    if (from || to) {
        cnWhere.createdAt = {};
        if (from) { cnWhere.createdAt[Op.gte] = new Date(`${from}T00:00:00`); }
        if (to)   { cnWhere.createdAt[Op.lte] = new Date(`${to}T23:59:59`); }
    }
    const creditNotesRows = await CreditNote.findAll({ where: cnWhere, attributes: ['amount'] });
    const creditNotes = creditNotesRows.reduce((a, c) => a + Number(c.amount || 0), 0);

    const net = income - creditNotes - totalExpenses;

    const rows = expenses.map(e => ({
        id: e.id, category: e.category, description: e.description,
        amount: Number(e.amount || 0), incurredOn: e.incurredOn,
        branchName: e.branchId ? (branchNameById[e.branchId] || `#${e.branchId}`) : '—',
    }));

    const data = { income, creditNotes, totalExpenses, net, byCategory, filters: { from, to } };
    res.render('report/expenses', {
        ...data,
        rows,
        branches,
        categories: CATEGORIES,
        isAdmin,
        ok: req.query.ok || null,
        error: req.query.error || null,
        narrative: narrator.expensesResult(data),
    });
};

const createExpense = async (req, res) => {
    try {
        const viewer = res.locals.currentUser;
        const amount = parseFloat(req.body.amount);
        const category = (req.body.category || '').trim();
        if (!category || !Number.isFinite(amount) || amount <= 0) {
            return res.redirect('/report/expenses?error=1');
        }
        // El supervisor sólo puede imputar a su sucursal; el admin elige (o ninguna).
        let branchId = null;
        if (viewer?.roleId === 4) { branchId = req.body.branchId ? Number(req.body.branchId) : null; }
        else { branchId = viewer?.branchId || null; }

        await Expense.create({
            category,
            description: (req.body.description || '').trim() || null,
            amount,
            incurredOn: req.body.incurredOn || new Date().toISOString().slice(0, 10),
            branchId,
            createdByUserId: viewer?.id || null,
        });
        res.redirect('/report/expenses?ok=1');
    } catch (err) {
        console.error('createExpense:', err.message);
        res.redirect('/report/expenses?error=1');
    }
};

const deleteExpense = async (req, res) => {
    try {
        const viewer = res.locals.currentUser;
        const where = { id: Number(req.params.id) };
        // El supervisor sólo borra gastos de su sucursal.
        if (viewer?.roleId !== 4) { where.branchId = viewer?.branchId || null; }
        await Expense.destroy({ where });
        res.redirect('/report/expenses?ok=1');
    } catch (err) {
        console.error('deleteExpense:', err.message);
        res.redirect('/report/expenses?error=1');
    }
};

module.exports = { getExpensesReport, createExpense, deleteExpense };
