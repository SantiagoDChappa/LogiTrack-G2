// Ojo de Patrón — orquestador del control de fatiga.
// Cubre US-1..US-14 (lado servidor). Ley 25.326: solo score + metadata.

const { Op } = require('sequelize');
const { FatigueCheck } = require('../../models/fatigueCheck');
const { FatiguePatternCounter } = require('../../models/fatiguePatternCounter');
const configSvc = require('./config');
const scorer = require('./scorer');
const notify = require('./notify');

// ── Consentimiento (US-1 / US-11) ───────────────────────────────────────────
async function recordConsent({ userId, routeId, branchId, accepted, version, triggerType = 'INICIO' }) {
    const check = await FatigueCheck.create({
        userId, routeId, branchId, triggerType,
        consentStatus: accepted ? 'ACCEPTED' : 'REJECTED',
        consentVersion: version || null,
        consentAt: new Date(),
    });
    await notify.audit(accepted ? 'CONSENT_ACCEPTED' : 'CONSENT_REJECTED',
        { actorId: userId, checkId: check.id, detail: `Ruta #${routeId}, versión ${version}` });
    return check;
}

async function revokeConsent({ userId, actorId }) {
    await notify.audit('CONSENT_REVOKED', { actorId: actorId || userId, detail: `Transportista #${userId}` });
    return { ok: true };
}

// ── Evaluación de la prueba (US-2 / US-3 / US-4 / US-9 / US-10) ──────────────
// Si se pasa checkId, actualiza esa fila (flujo de inicio tras consentimiento).
// Si no, crea una nueva (re-chequeo en ruta, consentimiento ya otorgado).
async function evaluate({ checkId, userId, routeId, branchId, method, metrics, triggerType = 'INICIO', cfg }) {
    const config = cfg || await configSvc.getConfig(branchId);
    const expectedMs = config.testDurationSec * 1000;
    const scoreValue = scorer.score({ method, metrics: { expectedMs, ...metrics } });
    const decision = scorer.decide(scoreValue, config);

    let check;
    if (checkId) {
        check = await FatigueCheck.findByPk(checkId);
    }
    if (check) {
        await check.update({ method, score: scoreValue, threshold: config.thresholdPct, decision, triggerType });
    } else {
        check = await FatigueCheck.create({
            userId, routeId, branchId, triggerType, method,
            consentStatus: 'ACCEPTED', consentVersion: config.consentVersion, consentAt: new Date(),
            score: scoreValue, threshold: config.thresholdPct, decision,
        });
    }

    await notify.audit('EVALUATED', { actorId: userId, checkId: check.id, detail: `score ${scoreValue} → ${decision}` });

    if (decision === 'BLOCKED') {
        await bumpPatternCounter(check.userId);
        const transportName = await driverName(check.userId);
        await notify.notifyBlock({ check, branchId, transportName, routeId, score: scoreValue });
    }
    return { checkId: check.id, score: scoreValue, threshold: config.thresholdPct, decision };
}

// ── Gate de inicio de ruta (US-1 / US-4) ────────────────────────────────────
function latestForRoute(routeId, triggerType = 'INICIO') {
    return FatigueCheck.findOne({
        where: { routeId, triggerType },
        order: [['createdAt', 'DESC']],
    });
}

// ¿Puede iniciar la ruta? Requiere consentimiento aceptado y (apto o liberado).
async function canStart(routeId) {
    const check = await latestForRoute(routeId);
    if (!check) { return { ok: false, reason: 'FATIGUE_REQUIRED' }; }
    if (check.consentStatus !== 'ACCEPTED') { return { ok: false, reason: 'CONSENT_REQUIRED', checkId: check.id }; }
    if (check.decision === 'BLOCKED' && !check.releasedAt) { return { ok: false, reason: 'BLOCKED', checkId: check.id, score: check.score }; }
    if (check.decision !== 'APTO' && !check.releasedAt) { return { ok: false, reason: 'PENDING', checkId: check.id }; }
    return { ok: true, checkId: check.id };
}

// ── Gestión del bloqueo por el supervisor (US-6) ────────────────────────────
function listBlocked(branchId) {
    const where = { decision: 'BLOCKED', releasedAt: null };
    if (branchId) { where.branchId = branchId; }
    return FatigueCheck.findAll({ where, order: [['createdAt', 'DESC']] });
}

async function release({ checkId, actorId, reason, detail }) {
    const check = await FatigueCheck.findByPk(checkId);
    if (!check) { throw new Error('Chequeo no encontrado'); }
    await check.update({ releasedAt: new Date(), releasedBy: actorId, releaseReason: reason, releaseDetail: detail || null });
    await notify.audit('RELEASED', { actorId, checkId, detail: `Motivo: ${reason}. ${detail || ''}` });
    return check;
}

// ── Detección de patrón recurrente (US-8) ───────────────────────────────────
async function bumpPatternCounter(userId) {
    const [row] = await FatiguePatternCounter.findOrCreate({
        where: { userId }, defaults: { userId, blockedCount: 0 },
    });
    await row.update({ blockedCount: row.blockedCount + 1, lastEventAt: new Date() });
    return row;
}

async function patternStatus(userId, cfg) {
    const config = cfg || await configSvc.getConfig(null);
    const cutoff = new Date(Date.now() - config.patternWindowDays * 86400000);
    const windowCount = await FatigueCheck.count({
        where: { userId, decision: 'BLOCKED', createdAt: { [Op.gte]: cutoff } },
    });
    const counter = await FatiguePatternCounter.findByPk(userId);
    return {
        userId,
        windowCount,
        totalBlocked: counter ? counter.blockedCount : windowCount,
        recurrent: windowCount >= config.patternEventCount,
        threshold: config.patternEventCount,
        windowDays: config.patternWindowDays,
    };
}

// ── Derechos del titular (US-13) ────────────────────────────────────────────
function getDriverHistory(userId) {
    return FatigueCheck.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
}

async function suppressDriverData({ userId, actorId }) {
    const n = await FatigueCheck.destroy({ where: { userId } });
    await notify.audit('SUPPRESSED', { actorId, detail: `Supresión solicitada. ${n} registros eliminados del transportista #${userId}.` });
    return n;
}

// ── Retención y purga (US-12) ───────────────────────────────────────────────
// Los bloqueos ya quedaron en el contador agregado (bumpPatternCounter), así que
// borrar el detalle personal no pierde la capacidad de detectar patrón.
async function purgeExpired(retentionDays) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const n = await FatigueCheck.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    await notify.audit('PURGED', { detail: `Purga por retención (${retentionDays} días): ${n} registros eliminados/disociados.` });
    return n;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function driverName(userId) {
    try {
        const { User } = require('../../models/user');
        const u = await User.findByPk(userId, { attributes: ['fullName'] });
        return u ? u.fullName : null;
    } catch { return null; }
}

module.exports = {
    recordConsent, revokeConsent, evaluate, latestForRoute, canStart,
    listBlocked, release, bumpPatternCounter, patternStatus,
    getDriverHistory, suppressDriverData, purgeExpired,
};
