'use strict';

const { getPendingReleaseForUser, releaseKey, isValidReleaseId } = require('../src/data/releaseNotes');

describe('releaseNotes', () => {
    describe('getPendingReleaseForUser', () => {
        it('devuelve release pendiente para operador', () => {
            const pending = getPendingReleaseForUser({}, 2);
            expect(pending).not.toBeNull();
            expect(pending.id).toBe('2026-06');
            expect(pending.features).toHaveLength(1);
            expect(pending.features[0].id).toBe('cobro-envios');
        });

        it('devuelve release pendiente para repartidor', () => {
            const pending = getPendingReleaseForUser({}, 3);
            expect(pending.features[0].id).toBe('copiloto-voz');
        });

        it('no devuelve release ya visto', () => {
            const seen = { [releaseKey('2026-06')]: true };
            expect(getPendingReleaseForUser(seen, 2)).toBeNull();
        });
    });

    describe('isValidReleaseId', () => {
        it('acepta ids del catálogo', () => {
            expect(isValidReleaseId('2026-06')).toBe(true);
        });

        it('rechaza ids desconocidos', () => {
            expect(isValidReleaseId('1999-01')).toBe(false);
        });
    });
});
