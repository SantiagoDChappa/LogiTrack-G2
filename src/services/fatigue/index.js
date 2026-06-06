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

// LGT-195: liberar un bloqueo. "falso_positivo" deja la ruta apta sin nueva
// prueba (Esc.2); "autorizado_descanso"/"otro" exigen rehacer la prueba (Esc.3/4).
async function release({ checkId, actorId, reason, detail }) {
    const { Route, RouteStatus } = require('../../models/route');
    const { RouteFatigueSession } = require('../../models/routeFatigueSession');
    const check = await FatigueCheck.findByPk(checkId);
    if (!check) { throw new Error('Chequeo no encontrado'); }
    const requiresRetest = reason !== 'falso_positivo';
    await check.update({ releasedAt: new Date(), releasedBy: actorId, releaseReason: reason, releaseDetail: detail || null });

    if (check.routeId) {
        const route = await Route.findByPk(check.routeId);
        if (route && route.statusId === RouteStatus.PAUSED_FATIGUE) {
            // Bloqueo en viaje (LGT-199).
            if (requiresRetest) {
                // El conductor debe rehacer la prueba: el widget la pedirá (RECHECK_PENDING).
                await RouteFatigueSession.update(
                    { state: 'RECHECK_PENDING', pausedAt: null, restUntil: null },
                    { where: { routeId: route.id } });
            } else {
                // Falso positivo: reanuda y reinicia el conteo de conducción.
                await route.update({ statusId: RouteStatus.IN_ROUTE });
                await RouteFatigueSession.update(
                    { state: 'DRIVING', driveStartedAt: new Date(), stoppedAt: null, recheckRequestedAt: null, pausedAt: null, restUntil: null },
                    { where: { routeId: route.id } });
            }
        } else if (route && route.statusId === RouteStatus.BLOCKED_FATIGUE) {
            // Bloqueo al inicio: la ruta vuelve a planificada; el gate la deja salir (releasedAt).
            await route.update({ statusId: RouteStatus.PLANNED });
        }
    }

    await notify.audit('RELEASED', {
        actorId, checkId,
        detail: `Motivo: ${reason}. ${requiresRetest ? 'Requiere nueva prueba. ' : 'Sin nueva prueba. '}${detail || ''}`,
    });
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

// ── Reasignación de ruta (LGT-193 Esc.9/10, LGT-190 Esc.7) ──────────────────
// Transfiere la ruta a otro transporte (conductor) de la MISMA sucursal sin
// desvincular los envíos (siguen colgados de la ruta vía route_stop). La ruta
// vuelve a PLANNED para que el nuevo conductor rehaga consentimiento + prueba.
async function reassignRoute({ routeId, newTransportId, actorId, actorBranchId }) {
    const { Op } = require('sequelize');
    const { Route, RouteStatus } = require('../../models/route');
    const { Transport } = require('../../models/transport');
    const { RouteFatigueSession } = require('../../models/routeFatigueSession');

    const route = await Route.findByPk(routeId);
    if (!route) { throw new Error('Ruta no encontrada'); }
    // RBAC: exclusivo del Supervisor de la sucursal de origen (Esc.10). actorBranchId
    // null = admin → se rechaza en el controller; acá reforzamos por sucursal.
    if (actorBranchId && route.originBranchId !== actorBranchId) {
        throw new Error('No autorizado: la ruta es de otra sucursal');
    }
    const tx = await Transport.findByPk(newTransportId);
    if (!tx || !tx.driverUserId) { throw new Error('El transporte no existe o no tiene conductor asignado'); }
    if (tx.branchId !== route.originBranchId) { throw new Error('El transporte es de otra sucursal'); }
    if (tx.outOfService || !tx.enabled) { throw new Error('El transporte no está disponible'); }

    // Regla de negocio: una sola ruta activa por conductor.
    const driverTxIds = (await Transport.findAll({
        where: { driverUserId: tx.driverUserId }, attributes: ['id'],
    })).map(t => t.id);
    const active = await Route.findOne({
        where: {
            id: { [Op.ne]: routeId },
            transportId: { [Op.in]: driverTxIds.length ? driverTxIds : [0] },
            statusId: { [Op.in]: [RouteStatus.PLANNED, RouteStatus.IN_ROUTE, RouteStatus.PAUSED_FATIGUE] },
        },
    });
    if (active) { throw new Error(`El conductor ya tiene una ruta activa (#${active.id})`); }

    const prevTransportId = route.transportId;
    await route.update({ transportId: newTransportId, statusId: RouteStatus.PLANNED, startedAt: null });
    await RouteFatigueSession.destroy({ where: { routeId } });
    await notify.audit('ROUTE_REASSIGNED', {
        actorId,
        detail: `Ruta #${routeId}: transporte ${prevTransportId} → ${newTransportId} (conductor #${tx.driverUserId}). Envíos conservados.`,
    });
    return { ok: true, newDriverUserId: tx.driverUserId };
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
    listBlocked, release, reassignRoute, bumpPatternCounter, patternStatus,
    getDriverHistory, suppressDriverData, purgeExpired,
};
