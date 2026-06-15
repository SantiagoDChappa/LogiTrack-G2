const incidentRules = require('../../src/services/incidentRules');
const { Status, RoleType } = require('../../src/constants/enums');

const brokenType = { id: 1, code: 'PACKAGE_BROKEN', description: 'Paquete roto' };

describe('LGT-220 — estado paquete roto: interno siempre permite, cliente solo Entregado', () => {
    test('alta interna (getEligibilityError): PACKAGE_BROKEN En Tránsito → permite (null)', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.IN_TRANSIT.id }, brokenType, []);
        expect(msg).toBeNull();
    });

    test('alta interna: PACKAGE_BROKEN Entregado → permite (null)', () => {
        const msg = incidentRules.getEligibilityError({ statusId: Status.DELIVERED.id }, brokenType, []);
        expect(msg).toBeNull();
    });

    test('alta interna: PACKAGE_BROKEN Pendiente/Cancelado → sigue bloqueado (regla previa)', () => {
        expect(incidentRules.getEligibilityError({ statusId: Status.PENDING.id }, brokenType, [])).toBeTruthy();
        expect(incidentRules.getEligibilityError({ statusId: Status.CANCELLED.id }, brokenType, [])).toBeTruthy();
    });

    test('canal cliente (getClientEligibilityError): PACKAGE_BROKEN En Tránsito → bloquea (solo Entregado)', () => {
        const msg = incidentRules.getClientEligibilityError({ statusId: Status.IN_TRANSIT.id }, brokenType, []);
        expect(msg).toMatch(/Entregado/i);
    });

    test('canal cliente: PACKAGE_BROKEN Entregado → permite (null)', () => {
        const msg = incidentRules.getClientEligibilityError({ statusId: Status.DELIVERED.id }, brokenType, []);
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
