const { isBusinessDay, addBusinessDays, estimateDeliveryDate } = require('../src/utils/deliveryEstimate');

describe('deliveryEstimate (autogestión — fecha estimada)', () => {
    test('isBusinessDay distingue fin de semana', () => {
        // Fechas locales (mes 0-based) para evitar el parseo UTC de 'YYYY-MM-DD'.
        expect(isBusinessDay(new Date(2026, 5, 12))).toBe(true);  // viernes
        expect(isBusinessDay(new Date(2026, 5, 13))).toBe(false); // sábado
        expect(isBusinessDay(new Date(2026, 5, 14))).toBe(false); // domingo
    });

    test('addBusinessDays saltea el fin de semana', () => {
        // Viernes 2026-06-12 + 1 hábil → lunes 2026-06-15
        const d = addBusinessDays(new Date(2026, 5, 12, 10, 0, 0), 1);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(5); // junio
        expect(d.getDate()).toBe(15);
    });

    test('retiro por sucursal estima antes que envío a domicilio', () => {
        const from = new Date(2026, 5, 8, 9, 0, 0); // lunes
        const home = estimateDeliveryDate({ mode: 'home', from });
        const pickup = estimateDeliveryDate({ mode: 'branch_pickup', from });
        expect(pickup.getTime()).toBeLessThan(home.getTime());
    });

    test('lead times configurables', () => {
        const from = new Date(2026, 5, 8, 9, 0, 0); // lunes
        const d = estimateDeliveryDate({ mode: 'home', from, leadHomeDays: 2 });
        expect(d.getDate()).toBe(10); // miércoles
    });
});
