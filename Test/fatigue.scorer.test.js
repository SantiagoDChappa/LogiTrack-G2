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
    test('voz acousticScore tiene prioridad sobre matchRatio', () => {
        // Aunque la frase coincida perfecto, manda el puntaje acústico real.
        expect(scorer.scoreFromVoice({ matchRatio: 1, acousticScore: 90 })).toBe(90);
        expect(scorer.scoreFromVoice({ matchRatio: 0, acousticScore: 10 })).toBe(10);
    });
    test('score() despacha por método y valida', () => {
        expect(scorer.score({ method: 'REACCION', metrics: { reactionsMs: [300] } })).toBeGreaterThanOrEqual(0);
        expect(() => scorer.score({ method: 'NADA' })).toThrow();
    });
    test('voz phraseGateFailed → fatiga 100 (no leyó la frase)', () => {
        expect(scorer.scoreFromVoice({ phraseGateFailed: true })).toBe(100);
    });
    test('reacción PROMEDIO: apto si avg ≤ límite', () => {
        const base = { fastMs: 250, slowMs: 800, mode: 'PROMEDIO', autoBlock: true };
        expect(scorer.evaluateReaction({ ...base, reactionsMs: [300, 700, 500] }).decision).toBe('APTO'); // avg 500
        expect(scorer.evaluateReaction({ ...base, reactionsMs: [900, 950, 1000] }).decision).toBe('BLOCKED'); // avg 950
    });
    test('reacción APROBADOS: UNO/MITAD/TODOS', () => {
        const base = { fastMs: 250, slowMs: 800, mode: 'APROBADOS', autoBlock: true };
        const r = [300, 900, 950]; // 1 bajo el límite de 3
        expect(scorer.evaluateReaction({ ...base, required: 'UNO', reactionsMs: r }).decision).toBe('APTO');
        expect(scorer.evaluateReaction({ ...base, required: 'MITAD', reactionsMs: r }).decision).toBe('BLOCKED'); // necesita 2
        expect(scorer.evaluateReaction({ ...base, required: 'TODOS', reactionsMs: [300, 400, 500] }).decision).toBe('APTO');
        expect(scorer.evaluateReaction({ ...base, required: 'TODOS', reactionsMs: [300, 400, 900] }).decision).toBe('BLOCKED');
    });
    test('decide() respeta umbral y autoBlock (US-4/US-7)', () => {
        expect(scorer.decide(90, { autoBlock: true, thresholdPct: 85 })).toBe('BLOCKED');
        expect(scorer.decide(80, { autoBlock: true, thresholdPct: 85 })).toBe('APTO');
        expect(scorer.decide(90, { autoBlock: false, thresholdPct: 85 })).toBe('APTO');
    });
});
