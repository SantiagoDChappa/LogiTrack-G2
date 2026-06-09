const scorer = require('../src/services/fatigue/scorer');

describe('Ojo de Patrón — scorer (US-3/US-9)', () => {
    test('reacción rápida → fatiga baja', () => {
        expect(scorer.scoreFromReaction([250, 260, 240])).toBeLessThanOrEqual(5);
    });
    test('reacción lenta → fatiga alta', () => {
        expect(scorer.scoreFromReaction([800, 820, 790])).toBeGreaterThanOrEqual(95);
    });
    test('reacción sin datos → 100 (fail-safe)', () => {
        expect(scorer.scoreFromReaction([])).toBe(100);
    });
    test('voz muestra completa → fatiga baja', () => {
        expect(scorer.scoreFromVoice({ durationMs: 5000, expectedMs: 5000 })).toBeLessThanOrEqual(20);
    });
    test('voz mockScore fuerza el valor', () => {
        expect(scorer.scoreFromVoice({ mockScore: 90 })).toBe(90);
    });
    test('voz matchRatio alto (frase leída bien) → fatiga baja', () => {
        expect(scorer.scoreFromVoice({ matchRatio: 1 })).toBeLessThanOrEqual(15);
        expect(scorer.scoreFromVoice({ matchRatio: 0.6 })).toBeLessThanOrEqual(50);
    });
    test('voz matchRatio bajo → fatiga alta', () => {
        expect(scorer.scoreFromVoice({ matchRatio: 0 })).toBeGreaterThanOrEqual(95);
    });
    test('score() despacha por método y valida', () => {
        expect(scorer.score({ method: 'REACCION', metrics: { reactionsMs: [300] } })).toBeGreaterThanOrEqual(0);
        expect(() => scorer.score({ method: 'NADA' })).toThrow();
    });
    test('decide() respeta umbral y autoBlock (US-4/US-7)', () => {
        expect(scorer.decide(90, { autoBlock: true, thresholdPct: 85 })).toBe('BLOCKED');
        expect(scorer.decide(80, { autoBlock: true, thresholdPct: 85 })).toBe('APTO');
        expect(scorer.decide(90, { autoBlock: false, thresholdPct: 85 })).toBe('APTO');
    });
});
