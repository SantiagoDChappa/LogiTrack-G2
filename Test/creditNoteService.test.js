// LGT-214 — generación de nota de crédito (idempotente, importe = total del envío).
jest.mock('../src/models/creditNote', () => ({ CreditNote: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() } }));
jest.mock('../src/models/shipment', () => ({ getById: jest.fn() }));
jest.mock('../src/services/shipmentCostService', () => ({ computeTotal: jest.fn() }));

const { CreditNote } = require('../src/models/creditNote');
const shipmentModel = require('../src/models/shipment');
const costSvc = require('../src/services/shipmentCostService');
const svc = require('../src/services/creditNoteService');

beforeEach(() => jest.clearAllMocks());

test('buildNumber formatea el correlativo', () => {
    expect(svc.buildNumber(5)).toBe('NC-0001-00000005');
});

test('genera nota con importe = total del envío y numera por id', async () => {
    CreditNote.findOne.mockResolvedValue(null);
    shipmentModel.getById.mockResolvedValue({ id: 1 });
    costSvc.computeTotal.mockResolvedValue(10285);
    const created = { id: 5, update: jest.fn().mockResolvedValue() };
    CreditNote.create.mockResolvedValue(created);

    const r = await svc.generate({ shipmentId: 1, incidentId: 7, userId: 9 });

    expect(r.ok).toBe(true);
    expect(CreditNote.create).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: 1, incidentId: 7, amount: 10285, createdByUserId: 9 }));
    expect(created.update).toHaveBeenCalledWith({ number: 'NC-0001-00000005' });
});

test('no duplica: si ya existe nota para la incidencia, la devuelve sin crear', async () => {
    CreditNote.findOne.mockResolvedValue({ id: 3, number: 'NC-0001-00000003' });
    const r = await svc.generate({ shipmentId: 1, incidentId: 7 });
    expect(r.ok).toBe(true);
    expect(r.duplicated).toBe(true);
    expect(CreditNote.create).not.toHaveBeenCalled();
});

test('envío inexistente → error', async () => {
    CreditNote.findOne.mockResolvedValue(null);
    shipmentModel.getById.mockResolvedValue(null);
    const r = await svc.generate({ shipmentId: 999, returnId: 4 });
    expect(r.ok).toBe(false);
});
