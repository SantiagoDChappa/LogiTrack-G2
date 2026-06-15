// LGT-182 — servicio de solicitud de devoluciones (elegibilidad + alta), modelos mockeados.
jest.mock('../src/database/connection', () => ({ transaction: jest.fn(async (cb) => cb({})) }));
jest.mock('../src/models/shipmentReturn', () => ({
    ShipmentReturn: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
    ShipmentReturnHistory: { create: jest.fn() },
}));
jest.mock('../src/models/shipmentHistory', () => ({ ShipmentHistory: { findOne: jest.fn() } }));
jest.mock('../src/models/setting', () => ({ get: jest.fn() }));

const settingModel = require('../src/models/setting');
const { ShipmentReturn, ShipmentReturnHistory } = require('../src/models/shipmentReturn');
const { ShipmentHistory } = require('../src/models/shipmentHistory');
const svc = require('../src/services/returnService');

const DELIVERED = { id: 7, statusId: 4 };

beforeEach(() => {
    jest.clearAllMocks();
    settingModel.get.mockResolvedValue(null);          // ventana default 30
    ShipmentHistory.findOne.mockResolvedValue({ changedAt: new Date() }); // entregado hoy
    ShipmentReturn.findOne.mockResolvedValue(null);    // sin devolución abierta
});

describe('checkEligibility', () => {
    test('envío no entregado → no elegible', async () => {
        const r = await svc.checkEligibility({ id: 1, statusId: 2 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/30 días/);
    });

    test('entregado, dentro de ventana, sin devolución abierta → elegible', async () => {
        const r = await svc.checkEligibility(DELIVERED);
        expect(r.ok).toBe(true);
        expect(r.windowDays).toBe(30);
    });

    test('entregado pero fuera de la ventana → no elegible', async () => {
        const old = new Date(); old.setDate(old.getDate() - 40);
        ShipmentHistory.findOne.mockResolvedValue({ changedAt: old });
        const r = await svc.checkEligibility(DELIVERED);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/30 días/);
    });

    test('ya hay una devolución en curso → no elegible', async () => {
        ShipmentReturn.findOne.mockResolvedValue({ id: 99, status: 'SOLICITADA' });
        const r = await svc.checkEligibility(DELIVERED);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/en curso/);
    });

    test('ventana parametrizable desde Ajustes', async () => {
        settingModel.get.mockResolvedValue('15');
        const r = await svc.checkEligibility(DELIVERED);
        expect(r.windowDays).toBe(15);
    });
});

describe('validateForm', () => {
    test('sin motivo → error', () => {
        expect(svc.validateForm({}).error).toBeTruthy();
    });
    test('OTRO sin texto → error', () => {
        expect(svc.validateForm({ reason: 'OTRO' }).error).toMatch(/Detallá/);
    });
    test('motivo válido → ok con modalidad home por defecto', () => {
        const v = svc.validateForm({ reason: 'DEFECTUOSO' });
        expect(v.error).toBeUndefined();
        expect(v).toMatchObject({ reason: 'DEFECTUOSO', deliveryMode: 'home', pickupBranchId: null });
    });
    test('modalidad sucursal sin sucursal → error', () => {
        expect(svc.validateForm({ reason: 'DEFECTUOSO', deliveryMode: 'branch' }).error).toMatch(/sucursal/i);
    });
});

describe('createReturn', () => {
    test('crea la devolución SOLICITADA + historial', async () => {
        ShipmentReturn.create.mockResolvedValue({ id: 42 });
        ShipmentReturnHistory.create.mockResolvedValue({});
        const res = await svc.createReturn({ shipment: DELIVERED, client: { document: '30111222' }, body: { reason: 'DANADO' } });
        expect(res.ok).toBe(true);
        expect(res.returnId).toBe(42);
        expect(ShipmentReturn.create).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: 7, status: 'SOLICITADA', reason: 'DANADO' }), expect.anything());
        expect(ShipmentReturnHistory.create).toHaveBeenCalled();
    });

    test('no crea si no es elegible', async () => {
        const res = await svc.createReturn({ shipment: { id: 1, statusId: 2 }, client: {}, body: { reason: 'DANADO' } });
        expect(res.ok).toBe(false);
        expect(ShipmentReturn.create).not.toHaveBeenCalled();
    });
});
