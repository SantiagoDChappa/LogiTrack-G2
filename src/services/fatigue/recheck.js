// Ojo de Patrón (LGT-199) — lógica del re-chequeo de fatiga durante la ruta.
// Disparo MANUAL: el transportista presiona "Estoy detenido"; tras cumplir los
// tiempos mínimos de conducción y de detención, el sistema pide una nueva prueba.
// No hay detección automática por movimiento del vehículo (decisión de alcance).
//
// Los helpers puros (sin DB) son testeables de forma aislada.

const { RouteFatigueSession, RecheckState } = require('../../models/routeFatigueSession');

const MS_MIN = 60000;

// ── Helpers puros ────────────────────────────────────────────────────────────
function minutesBetween(from, to) {
    if (!from || !to) { return 0; }
    return (new Date(to) - new Date(from)) / MS_MIN;
}

// Estado efectivo a partir de los timestamps + config. No toca DB.
// Promueve STOPPED → RECHECK_PENDING cuando se cumplen ambos umbrales (Esc.2/6).
function deriveState(session, cfg, now = new Date()) {
    if (!session) { return { state: RecheckState.DRIVING }; }
    if (session.state === RecheckState.PAUSED) {
        const restRemaining = Math.max(0, Math.ceil(minutesBetween(now, session.restUntil)));
        return { state: RecheckState.PAUSED, restRemaining, canRetry: restRemaining <= 0 };
    }
    if (session.state === RecheckState.RECHECK_PENDING) {
        return { state: RecheckState.RECHECK_PENDING };
    }
    if (session.state === RecheckState.STOPPED) {
        const driveMin   = minutesBetween(session.driveStartedAt, session.stoppedAt || now);
        const stoppedMin = minutesBetween(session.stoppedAt, now);
        const triggers = driveMin >= cfg.recheckDriveMin && stoppedMin >= cfg.recheckStoppedMin;
        return {
            state: triggers ? RecheckState.RECHECK_PENDING : RecheckState.STOPPED,
            driveMin, stoppedMin, triggers,
        };
    }
    return { state: RecheckState.DRIVING };
}

// Hora a la que se hará el próximo chequeo (Date) o null si no hay uno agendado.
//  - DETENIDO: stoppedAt + recheckStoppedMin (se agenda apenas el conductor se detiene).
//  - PAUSADO: restUntil (cuándo se habilita reintentar la prueba).
function nextCheckAt(session, cfg, derived) {
    if (!session) { return null; }
    if (derived.state === RecheckState.PAUSED) {
        return session.restUntil ? new Date(session.restUntil) : null;
    }
    if (derived.state === RecheckState.STOPPED && session.stoppedAt) {
        return new Date(new Date(session.stoppedAt).getTime() + cfg.recheckStoppedMin * MS_MIN);
    }
    return null;
}

// Esc.7: reanudar marcha antes de que se dispare el re-chequeo descarta el conteo.
function canDiscardStop(session) {
    return !!session && session.state === RecheckState.STOPPED;
}

// ── Operaciones con DB ───────────────────────────────────────────────────────
async function ensureSession(routeId, route) {
    const [row] = await RouteFatigueSession.findOrCreate({
        where: { routeId },
        defaults: {
            routeId,
            driveStartedAt: route?.startedAt || new Date(),
            state: RecheckState.DRIVING,
        },
    });
    return row;
}

// "Estoy detenido": empieza a contar la detención (Esc.1/2).
async function markStopped(routeId, route, cfg) {
    const s = await ensureSession(routeId, route);
    if (s.state === RecheckState.DRIVING) {
        await s.update({ stoppedAt: new Date(), state: RecheckState.STOPPED, updatedAt: new Date() });
    }
    return getStatus(routeId, route, cfg);
}

// "Reanudar marcha": si todavía no se disparó el re-chequeo, descarta el conteo (Esc.7).
async function resume(routeId, route, cfg) {
    const s = await ensureSession(routeId, route);
    if (canDiscardStop(s)) {
        await s.update({ stoppedAt: null, state: RecheckState.DRIVING, updatedAt: new Date() });
    }
    return getStatus(routeId, route, cfg);
}

// Estado actual para la UI. Persiste la promoción a RECHECK_PENDING si corresponde.
async function getStatus(routeId, route, cfg) {
    const s = await ensureSession(routeId, route);
    const d = deriveState(s, cfg);
    if (d.state === RecheckState.RECHECK_PENDING && s.state !== RecheckState.RECHECK_PENDING) {
        await s.update({ state: RecheckState.RECHECK_PENDING, recheckRequestedAt: new Date(), updatedAt: new Date() });
    }
    const next = nextCheckAt(s, cfg, d);
    // Tiempo de manejo acumulado para mostrarlo al repartidor (vs el umbral).
    // Si está detenido, queda congelado en el momento de detenerse (stoppedAt).
    const driveRef = s.stoppedAt || new Date();
    const driveMin = s.driveStartedAt ? Math.max(0, Math.floor(minutesBetween(s.driveStartedAt, driveRef))) : 0;
    return {
        routeId,
        state: d.state,
        needsRecheck: d.state === RecheckState.RECHECK_PENDING,
        paused: d.state === RecheckState.PAUSED,
        restRemainingMin: d.restRemaining || 0,
        methodRecheck: cfg.methodRecheck,
        nextCheckAt: next ? next.toISOString() : null,
        driveMin,
        driveThresholdMin: cfg.recheckDriveMin,
        stoppedThresholdMin: cfg.recheckStoppedMin,
        driveReady: driveMin >= cfg.recheckDriveMin,
    };
}

// Esc.10: no se puede reintentar la prueba antes de cumplir el descanso mínimo.
async function guardRetry(routeId, cfg, now = new Date()) {
    const s = await RouteFatigueSession.findOne({ where: { routeId } });
    if (s && s.state === RecheckState.PAUSED && s.restUntil && new Date(s.restUntil) > now) {
        const remaining = Math.ceil(minutesBetween(now, s.restUntil));
        return { ok: false, restRemainingMin: remaining };
    }
    return { ok: true };
}

// Resultado de la prueba de re-chequeo.
// APTO  → reanuda y reinicia el conteo de conducción (Esc.3).
// BLOCKED → pausa por fatiga + descanso para reintentar (Esc.4/9/10).
async function onRecheckResult(routeId, decision, cfg) {
    const s = await RouteFatigueSession.findOne({ where: { routeId } });
    if (!s) { return; }
    if (decision === 'BLOCKED') {
        const restUntil = new Date(Date.now() + cfg.recheckRestMin * MS_MIN);
        await s.update({
            state: RecheckState.PAUSED, pausedAt: new Date(), restUntil,
            stoppedAt: null, recheckRequestedAt: null, updatedAt: new Date(),
        });
    } else {
        await s.update({
            state: RecheckState.DRIVING, driveStartedAt: new Date(),
            stoppedAt: null, recheckRequestedAt: null, pausedAt: null, restUntil: null,
            updatedAt: new Date(),
        });
    }
}

module.exports = {
    minutesBetween, deriveState, nextCheckAt, canDiscardStop,
    ensureSession, markStopped, resume, getStatus, guardRetry, onRecheckResult,
    RecheckState,
};
