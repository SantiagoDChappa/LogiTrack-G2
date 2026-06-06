const recheck = require('../../src/services/fatigue/recheck');
const { RecheckState } = require('../../src/models/routeFatigueSession');

const now = new Date('2026-06-06T12:00:00');
const minus = (min) => new Date(now.getTime() - min * 60000);
const plus  = (min) => new Date(now.getTime() + min * 60000);
const cfg = { recheckDriveMin: 90, recheckStoppedMin: 3, recheckRestMin: 30 };

describe('recheck.minutesBetween', () => {
    test('calcula minutos entre dos fechas', () => {
        expect(recheck.minutesBetween(minus(10), now)).toBe(10);
    });
    test('devuelve 0 si falta una fecha', () => {
        expect(recheck.minutesBetween(null, now)).toBe(0);
    });
});

describe('recheck.deriveState', () => {
    test('sin sesión → DRIVING', () => {
        expect(recheck.deriveState(null, cfg, now).state).toBe(RecheckState.DRIVING);
    });

    test('STOPPED con conducción y detención suficientes → RECHECK_PENDING', () => {
        const s = { state: RecheckState.STOPPED, driveStartedAt: minus(100), stoppedAt: minus(5) };
        const d = recheck.deriveState(s, cfg, now);
        expect(d.triggers).toBe(true);
        expect(d.state).toBe(RecheckState.RECHECK_PENDING);
    });

    test('STOPPED con poca detención → sigue STOPPED', () => {
        const s = { state: RecheckState.STOPPED, driveStartedAt: minus(100), stoppedAt: minus(1) };
        expect(recheck.deriveState(s, cfg, now).state).toBe(RecheckState.STOPPED);
    });

    test('STOPPED con poca conducción → no dispara', () => {
        const s = { state: RecheckState.STOPPED, driveStartedAt: minus(10), stoppedAt: minus(5) };
        expect(recheck.deriveState(s, cfg, now).triggers).toBe(false);
    });

    test('PAUSED con descanso pendiente → no se puede reintentar', () => {
        const s = { state: RecheckState.PAUSED, restUntil: plus(5) };
        const d = recheck.deriveState(s, cfg, now);
        expect(d.restRemaining).toBe(5);
        expect(d.canRetry).toBe(false);
    });

    test('PAUSED con descanso cumplido → se puede reintentar', () => {
        const s = { state: RecheckState.PAUSED, restUntil: minus(1) };
        const d = recheck.deriveState(s, cfg, now);
        expect(d.restRemaining).toBe(0);
        expect(d.canRetry).toBe(true);
    });
});

describe('recheck.canDiscardStop', () => {
    test('true solo si está detenido (STOPPED)', () => {
        expect(recheck.canDiscardStop({ state: RecheckState.STOPPED })).toBe(true);
        expect(recheck.canDiscardStop({ state: RecheckState.DRIVING })).toBe(false);
        expect(recheck.canDiscardStop(null)).toBe(false);
    });
});
