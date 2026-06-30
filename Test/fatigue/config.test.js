const cfg = require('../../src/services/fatigue/config');

describe('config.validateParam', () => {
    test('numérico en rango → ok', () => {
        expect(cfg.validateParam('recheckRestMin', '30').ok).toBe(true);
    });
    test('numérico fuera de rango → error', () => {
        expect(cfg.validateParam('recheckRestMin', '0').ok).toBe(false);
        expect(cfg.validateParam('thresholdPct', '150').ok).toBe(false);
    });
    test('booleano válido / inválido', () => {
        expect(cfg.validateParam('enabled', 'true').ok).toBe(true);
        expect(cfg.validateParam('enabled', 'maybe').ok).toBe(false);
    });
    test('enum válido / inválido', () => {
        expect(cfg.validateParam('method', 'VOZ').ok).toBe(true);
        expect(cfg.validateParam('method', 'X').ok).toBe(false);
    });
    test('parámetro desconocido → error', () => {
        expect(cfg.validateParam('noExiste', '1').ok).toBe(false);
    });
});

describe('config.coerce', () => {
    test('convierte tipos', () => {
        const out = cfg.coerce({ enabled: 'true', thresholdPct: '85', method: 'AMBOS' });
        expect(out.enabled).toBe(true);
        expect(out.thresholdPct).toBe(85);
        expect(out.method).toBe('AMBOS');
    });
});

describe('config.mergeRows', () => {
    test('global pisa default y sucursal pisa global', () => {
        const rows = [
            { param: 'thresholdPct', value: '70', branchId: null },
            { param: 'thresholdPct', value: '60', branchId: 5 },
        ];
        expect(cfg.mergeRows(rows, 5).thresholdPct).toBe(60);
        expect(cfg.mergeRows(rows, 9).thresholdPct).toBe(70); // sucursal sin override usa global
    });
});
