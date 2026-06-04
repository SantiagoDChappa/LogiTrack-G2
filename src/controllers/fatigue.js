// Ojo de Patrón — panel del supervisor/administrador.
// US-6 (gestión de bloqueos), US-7 (config), US-8 (patrón), US-12 (purga), US-14 (RBAC).

const fatigueSvc = require('../services/fatigue');
const fatigueCfg = require('../services/fatigue/config');
const notify = require('../services/fatigue/notify');
const { RoleType } = require('../constants/enums');

const isAdmin = (u) => u?.roleId === RoleType.ADMIN.id;
const scopeBranch = (u) => (isAdmin(u) ? null : (u?.branchId || null));

// GET /fatigue — rutas bloqueadas de la sucursal + patrón recurrente.
exports.index = async (req, res) => {
    const u = res.locals.currentUser;
    const branchId = scopeBranch(u);
    const blocked = await fatigueSvc.listBlocked(branchId);
    const cfg = await fatigueCfg.getConfig(branchId);

    const { FatiguePatternCounter } = require('../models/fatiguePatternCounter');
    const counters = await FatiguePatternCounter.findAll({ order: [['blockedCount', 'DESC']], limit: 50 });
    const patterns = [];
    for (const c of counters) { patterns.push(await fatigueSvc.patternStatus(c.userId, cfg)); }

    res.render('fatigue/index', {
        blocked: blocked.map(b => b.toJSON()),
        patterns,
        isAdmin: isAdmin(u),
        cfg,
    });
};

// POST /fatigue/:checkId/release — liberar con motivo (US-6).
exports.release = async (req, res) => {
    const u = res.locals.currentUser;
    const { FatigueCheck } = require('../models/fatigueCheck');
    const check = await FatigueCheck.findByPk(req.params.checkId);
    if (!check) { return res.status(404).json({ error: 'Chequeo no encontrado' }); }
    if (!isAdmin(u) && check.branchId !== u.branchId) {
        return res.status(403).json({ error: 'No autorizado: la ruta es de otra sucursal' });
    }
    const { reason, detail } = req.body;
    if (!reason) { return res.status(400).json({ error: 'El motivo es obligatorio' }); }
    await fatigueSvc.release({ checkId: check.id, actorId: u.id, reason, detail });
    res.json({ ok: true });
};

// POST /fatigue/:checkId/keep — mantener bloqueada (US-6).
exports.keep = async (req, res) => {
    const u = res.locals.currentUser;
    await notify.audit('KEEP_BLOCKED', { actorId: u.id, checkId: Number(req.params.checkId) });
    res.json({ ok: true });
};

// GET /fatigue/config — formulario de parámetros (US-7, solo admin).
exports.configPage = async (req, res) => {
    if (!isAdmin(res.locals.currentUser)) { return res.status(403).send('Solo administradores'); }
    const cfg = await fatigueCfg.getConfig(null);
    res.render('fatigue/config', { cfg, defaults: fatigueCfg.DEFAULTS, errors: [], saved: req.query.saved === '1' });
};

// POST /fatigue/config — guardar parámetros (US-7, solo admin).
exports.saveConfig = async (req, res) => {
    const u = res.locals.currentUser;
    if (!isAdmin(u)) { return res.status(403).send('Solo administradores'); }
    const errors = [];
    for (const param of Object.keys(fatigueCfg.DEFAULTS)) {
        let value = req.body[param];
        if (fatigueCfg.BOOL_PARAMS.includes(param)) { value = req.body[param] ? 'true' : 'false'; }
        if (value === undefined || value === '') { continue; }
        try { await fatigueCfg.setParam(param, value, { branchId: null, actorId: u.id }); }
        catch (e) { errors.push(e.message); }
    }
    if (errors.length) {
        const cfg = await fatigueCfg.getConfig(null);
        return res.status(400).render('fatigue/config', { cfg, defaults: fatigueCfg.DEFAULTS, errors, saved: false });
    }
    res.redirect('/fatigue/config?saved=1');
};

// POST /fatigue/purge — purga manual por retención (US-12, solo admin).
exports.purge = async (req, res) => {
    const u = res.locals.currentUser;
    if (!isAdmin(u)) { return res.status(403).json({ error: 'Solo administradores' }); }
    const cfg = await fatigueCfg.getConfig(null);
    const n = await fatigueSvc.purgeExpired(cfg.retentionDays);
    res.json({ ok: true, purged: n });
};
