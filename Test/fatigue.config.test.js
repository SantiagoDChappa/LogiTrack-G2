const cfg = require('../src/services/fatigue/config');

describe('Ojo de Patrón — config (US-7)', () => {
    test('validateParam: umbral fuera de rango falla', () => {
        expect(cfg.validateParam('thresholdPct', '150').ok).toBe(false);
        expect(cfg.validateParam('thresholdPct', '85').ok).toBe(true);
    });
    test('validateParam: enum de método', () => {
        expect(cfg.validateParam('method', 'VOZ').ok).toBe(true);
        expect(cfg.validateParam('method', 'OTRO').ok).toBe(false);
    });
    test('validateParam: booleanos', () => {
        expect(cfg.validateParam('enabled', 'true').ok).toBe(true);
        expect(cfg.validateParam('enabled', 'si').ok).toBe(false);
    });
    test('validateParam: parámetro desconocido', () => {
        expect(cfg.validateParam('xyz', '1').ok).toBe(false);
    });
    test('mergeRows: sucursal sobreescribe global y defaults', () => {
        const merged = cfg.mergeRows([
            { branchId: null, param: 'thresholdPct', value: '80' },
            { branchId: 5, param: 'thresholdPct', value: '70' },
        ], 5);
        expect(merged.thresholdPct).toBe(70);
        expect(merged.autoBlock).toBe(true);
        expect(merged.retentionDays).toBe(90);
    });
    test('coerce: tipa boolean/number/string', () => {
        const c = cfg.coerce({ enabled: 'true', thresholdPct: '85', method: 'VOZ' });
        expect(c.enabled).toBe(true);
        expect(c.thresholdPct).toBe(85);
        expect(c.method).toBe('VOZ');
    });
});
