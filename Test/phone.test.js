// LGT-207 — validación de teléfonos argentinos por característica real.
const { parseArPhone, isValidArPhone } = require('../src/utils/phone');

describe('parseArPhone', () => {
    test('fijo CABA 10 dígitos → válido, área 11', () => {
        const r = parseArPhone('1154565446');
        expect(r.ok).toBe(true);
        expect(r.area).toBe('11');
        expect(r.mobile).toBe(false);
    });

    test('celular CABA con 9 → válido, 11 dígitos, móvil', () => {
        const r = parseArPhone('91123842323');
        expect(r.ok).toBe(true);
        expect(r.area).toBe('11');
        expect(r.mobile).toBe(true);
    });

    test('interior 3 dígitos (Córdoba 351) → válido', () => {
        expect(parseArPhone('3514567890').ok).toBe(true);
    });

    test('área de 4 dígitos que empieza con 2/3 → válida estructuralmente', () => {
        expect(parseArPhone('2920456789').ok).toBe(true); // 2920 (4 díg) + 6
    });

    test('incompleto (911) → no válido por longitud', () => {
        expect(parseArPhone('911').ok).toBe(false);
        expect(parseArPhone('911').reason).toBe('length');
    });

    test('característica inexistente → no válido (reason area)', () => {
        const r = parseArPhone('9999999999');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('area');
    });

    test('vacío → no válido', () => {
        expect(parseArPhone('').ok).toBe(false);
    });

    test('isValidArPhone helper', () => {
        expect(isValidArPhone('1154565446')).toBe(true);
        expect(isValidArPhone('123')).toBe(false);
    });
});
