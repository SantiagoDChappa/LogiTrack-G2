const damage = require('../../src/services/incidentDamageResolution');

describe('damageResolution.isDamageType', () => {
    test('código real PACKAGE_BROKEN → true', () => {
        expect(damage.isDamageType({ code: 'PACKAGE_BROKEN' })).toBe(true);
    });
    test('descripción en español "Paquete roto" → true', () => {
        expect(damage.isDamageType({ code: 'X', description: 'Paquete roto o dañado' })).toBe(true);
    });
    test('otro tipo → false', () => {
        expect(damage.isDamageType({ code: 'DELAY', description: 'Demora' })).toBe(false);
    });
    test('null → false', () => {
        expect(damage.isDamageType(null)).toBe(false);
    });
});

describe('damageResolution.CHOICES', () => {
    test('opciones válidas', () => {
        expect(damage.CHOICES).toEqual(['REEMBOLSO', 'REEMPLAZO']);
    });
});
