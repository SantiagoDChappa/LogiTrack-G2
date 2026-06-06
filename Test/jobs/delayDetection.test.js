const job = require('../../src/jobs/delayDetectionJob');

const d = (s) => new Date(s + 'T00:00:00');

describe('delayDetection.isSignificantlyDelayed', () => {
    const today = d('2026-06-13');
    // span = 10 días (03 → 13... usamos created 03, expected 13? ). Usamos created 01, expected 11 → span 10.
    const ship = { createdAt: d('2026-06-01'), expectedDeliveryDate: d('2026-06-11') };

    test('15% de 10 días = 2 días permitidos; 2 de demora NO dispara', () => {
        expect(job.isSignificantlyDelayed(ship, d('2026-06-13'), 15)).toBe(false);
    });
    test('3 días de demora SÍ dispara', () => {
        expect(job.isSignificantlyDelayed(ship, d('2026-06-14'), 15)).toBe(true);
    });
    test('sin fecha esperada → false', () => {
        expect(job.isSignificantlyDelayed({ createdAt: d('2026-06-01') }, today, 15)).toBe(false);
    });
    test('% más alto tolera más demora', () => {
        expect(job.isSignificantlyDelayed(ship, d('2026-06-14'), 50)).toBe(false); // 50% de 10 = 5 días
    });
});

describe('delayDetection.shouldNotify', () => {
    const now = new Date('2026-06-13T12:00:00');
    test('nunca notificado → true', () => {
        expect(job.shouldNotify({ delayNotifiedAt: null }, now, 1)).toBe(true);
    });
    test('último aviso hace 2 días, intervalo 1 → true', () => {
        expect(job.shouldNotify({ delayNotifiedAt: new Date('2026-06-11T12:00:00') }, now, 1)).toBe(true);
    });
    test('último aviso hace 12h, intervalo 1 → false', () => {
        expect(job.shouldNotify({ delayNotifiedAt: new Date('2026-06-13T00:00:00') }, now, 1)).toBe(false);
    });
});
