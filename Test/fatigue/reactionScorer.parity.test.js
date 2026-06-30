// Verifica que el scorer de REACCIÓN del cliente (public/js/fatigue-reaction-scorer.js,
// usado para puntuar/bloquear offline) dé EXACTAMENTE lo mismo que el del servidor
// (src/services/fatigue/scorer.js). Si alguien toca uno y no el otro, este test rompe.
const serverScorer = require('../../src/services/fatigue/scorer');
const clientScorer = require('../../public/js/fatigue-reaction-scorer');

const cases = [
    { reactionsMs: [300, 320, 280], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: true },
    { reactionsMs: [900, 950, 1000], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: true },
    { reactionsMs: [900, 950, 1000], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: false },
    { reactionsMs: [300, 900, 400], fastMs: 250, slowMs: 800, mode: 'APROBADOS', required: 'MITAD', autoBlock: true },
    { reactionsMs: [300, 900, 400], fastMs: 250, slowMs: 800, mode: 'APROBADOS', required: 'TODOS', autoBlock: true },
    { reactionsMs: [900, 900, 400], fastMs: 250, slowMs: 800, mode: 'APROBADOS', required: 'UNO', autoBlock: true },
    { reactionsMs: [], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: true },
    { reactionsMs: [], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: false },
    { reactionsMs: [500], fastMs: 300, slowMs: 300, mode: 'PROMEDIO', required: 'MITAD', autoBlock: true }, // hi<=lo
    { reactionsMs: [120, 130], fastMs: 250, slowMs: 800, mode: 'PROMEDIO', required: 'MITAD', autoBlock: true },
];

describe('fatigue reaction scorer — paridad cliente/servidor', () => {
    test.each(cases)('evaluateReaction %o', (c) => {
        const expected = serverScorer.evaluateReaction(c);
        const actual = clientScorer.evaluateReaction(c);
        expect(actual).toEqual(expected);
    });

    test('scoreFromReaction coincide en un barrido de promedios', () => {
        for (let avg = 100; avg <= 1200; avg += 50) {
            expect(clientScorer.scoreFromReaction([avg], 250, 800))
                .toBe(serverScorer.scoreFromReaction([avg], 250, 800));
        }
    });
});
