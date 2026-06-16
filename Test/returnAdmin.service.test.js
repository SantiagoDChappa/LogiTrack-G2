// LGT-183 — gestión interna de devoluciones (aprobar/rechazar), modelos mockeados.
jest.mock('../src/database/connection', () => ({ transaction: jest.fn(async (cb) => cb({})) }));
jest.mock('../src/models/shipmentReturn', () => ({
    ShipmentReturn: { findByPk: jest.fn() },
    ShipmentReturnHistory: { create: jest.fn() },
}));
jest.mock('../src/models/shipmentHistory', () => ({ ShipmentHistory: { findOne: jest.fn() } }));
jest.mock('../src/models/setting', () => ({ get: jest.fn() }));

const { ShipmentReturn, ShipmentReturnHistory } = require('../src/models/shipmentReturn');
const svc = require('../src/services/returnService');

const makeReturn = (status) => ({ status, update: jest.fn().mockResolvedValue() });

beforeEach(() => {
    jest.clearAllMocks();
    ShipmentReturnHistory.create.mockResolvedValue({});
});

describe('resolveReturn — aprobar', () => {
    test('aprueba con resultado reembolso → En proceso', async () => {
        const r = makeReturn('SOLICITADA');
        ShipmentReturn.findByPk.mockResolvedValue(r);
        const res = await svc.resolveReturn({ returnId: 1, userId: 9, decision: 'approve', result: 'REEMBOLSO' });
        expect(res.ok).toBe(true);
        expect(res.status).toBe('EN_PROCESO');
        expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'EN_PROCESO', result: 'REEMBOLSO', reviewedByUserId: 9 }), expect.anything());
        expect(ShipmentReturnHistory.create).toHaveBeenCalled();
    });

    test('aprobar sin resultado → error', async () => {
        ShipmentReturn.findByPk.mockResolvedValue(makeReturn('SOLICITADA'));
        const res = await svc.resolveReturn({ returnId: 1, userId: 9, decision: 'approve' });
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/reembolso o reemplazo/i);
    });
});

describe('resolveReturn — rechazar', () => {
    test('rechaza con motivo → Rechazada', async () => {
        const r = makeReturn('SOLICITADA');
        ShipmentReturn.findByPk.mockResolvedValue(r);
        const res = await svc.resolveReturn({ returnId: 1, userId: 9, decision: 'reject', rejectionReason: 'No cumple' });
        expect(res.ok).toBe(true);
        expect(res.status).toBe('RECHAZADA');
        expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'RECHAZADA', rejectionReason: 'No cumple' }), expect.anything());
    });

    test('rechazar sin motivo → error', async () => {
        ShipmentReturn.findByPk.mockResolvedValue(makeReturn('SOLICITADA'));
        const res = await svc.resolveReturn({ returnId: 1, userId: 9, decision: 'reject', rejectionReason: '  ' });
        expect(res.ok).toBe(false);
    });
});

describe('resolveReturn — guardas', () => {
    test('no re-resolver una ya gestionada', async () => {
        ShipmentReturn.findByPk.mockResolvedValue(makeReturn('EN_PROCESO'));
        const res = await svc.resolveReturn({ returnId: 1, userId: 9, decision: 'approve', result: 'REEMBOLSO' });
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/ya fue gestionada/i);
    });

    test('devolución inexistente → 404', async () => {
        ShipmentReturn.findByPk.mockResolvedValue(null);
        const res = await svc.resolveReturn({ returnId: 999, userId: 9, decision: 'approve', result: 'REEMBOLSO' });
        expect(res.ok).toBe(false);
        expect(res.status).toBe(404);
    });
});
