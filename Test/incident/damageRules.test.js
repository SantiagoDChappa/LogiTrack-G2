const incidentRules = require('../../src/services/incidentRules');
const { Status, RoleType } = require('../../src/constants/enums');

const brokenType = { id: 1, code: 'PACKAGE_BROKEN', description: 'Paquete roto' };
const delayType  = { id: 2, code: 'DELAY', description: 'Demora' };

describe('LGT-220 — estado: paquete roto solo con envío Entregado (todos los canales)', () => {
    test('PACKAGE_BROKEN en estado distinto de Entregado → bloquea con mensaje claro', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.IN_TRANSIT.id }, brokenType, []);
        expect(msg).toBe('Solo podés reportar un paquete roto cuando el envío figura como Entregado.');
    });

    test('PACKAGE_BROKEN con envío Entregado → permite (null)', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.DELIVERED.id }, brokenType, []);
        expect(msg).toBeNull();
    });

    test('PACKAGE_BROKEN en Pendiente → sigue bloqueado (regla previa)', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.PENDING.id }, brokenType, []);
        expect(msg).toBeTruthy();
    });

    test('tipo sin allowlist (DELAY) no se ve afectado por la regla de estado requerido', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.AT_BRANCH.id }, delayType, []);
        expect(msg).toBeNull();
    });
});

describe('LGT-220 — rol: quién puede cargar paquete roto desde el alta interna', () => {
    test('Operador → bloqueado', () => {
        expect(incidentRules.getDamageRoleError(RoleType.OPERATOR.id)).toMatch(/Operador no puede/i);
    });

    test('Supervisor → permitido (null)', () => {
        expect(incidentRules.getDamageRoleError(RoleType.SUPERVISOR.id)).toBeNull();
    });

    test('Administrador → permitido (null)', () => {
        expect(incidentRules.getDamageRoleError(RoleType.ADMIN.id)).toBeNull();
    });

    test('Repartidor → permitido por rol (la asignación al envío la valida el controller)', () => {
        expect(incidentRules.getDamageRoleError(RoleType.DELIVERY.id)).toBeNull();
    });
});
