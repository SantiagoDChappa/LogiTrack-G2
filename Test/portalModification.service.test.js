jest.mock('../src/database/connection', () => ({
    transaction: jest.fn((cb) => cb({})),
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    })),
}));

jest.mock('../src/services/portalShipmentView', () => ({
    SELF_SERVICE_STATUS_IDS: [1, 3, 6, 7],
}));

jest.mock('../src/models/shipment', () => ({
    Shipment: {
        update: jest.fn().mockResolvedValue([1]),
        findByPk: jest.fn(),
    },
}));

jest.mock('../src/models/address', () => ({
    Address: { update: jest.fn().mockResolvedValue([1]) },
}));

jest.mock('../src/models/shipmentModificationRequest', () => ({
    create: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
    listByShipmentId: jest.fn(),
    listPending: jest.fn(),
}));

jest.mock('../src/models/shipmentHistory', () => ({
    create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/controllers/shipment', () => ({
    notifyShipmentEvent: jest.fn().mockResolvedValue(undefined),
}));

const sequelize = require('../src/database/connection');
const { Shipment } = require('../src/models/shipment');
const { Address } = require('../src/models/address');
const modificationRequestModel = require('../src/models/shipmentModificationRequest');
const shipmentHistoryModel = require('../src/models/shipmentHistory');
const {
    canModifyShipment,
    parseModificationPayload,
    submitPortalModification,
    approveRequest,
    rejectRequest,
} = require('../src/services/portalModificationService');
const { ModificationRequestStatus } = require('../src/constants/enums');

const baseShipment = {
    id: 10,
    statusId: 1,
    trackingId: 'ENV-010',
    addressId: 5,
    deliveryMode: 'home',
    pickupBranchId: null,
    expectedDeliveryFrom: '09:00:00',
    expectedDeliveryTo: '13:00:00',
    address: {
        street: 'Falsa',
        number: '123',
        postalCode: '1663',
        provinceId: 1,
        ringLabel: null,
        floorApt: null,
        referencesTxt: null,
        porterNote: null,
        restrictions: null,
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    modificationRequestModel.create.mockImplementation((data) => Promise.resolve({ id: 99, ...data }));
});

describe('canModifyShipment()', () => {
    test('permite estados editables', () => {
        expect(canModifyShipment({ statusId: 1 })).toBe(true);
        expect(canModifyShipment({ statusId: 7 })).toBe(true);
    });

    test('bloquea estados terminales', () => {
        expect(canModifyShipment({ statusId: 4 })).toBe(false);
        expect(canModifyShipment({ statusId: 2 })).toBe(false);
    });
});

describe('parseModificationPayload()', () => {
    test('clasifica cambios directos de franja y referencias', () => {
        const parsed = parseModificationPayload({
            windowFrom: '14:00:00',
            windowTo: '18:00:00',
            deliveryMode: 'home',
            ringLabel: '4B',
        }, baseShipment);

        expect(parsed.hasDirect).toBe(true);
        expect(parsed.hasSensitive).toBe(false);
        expect(parsed.direct.expectedDeliveryFrom).toBe('14:00:00');
        expect(parsed.direct.address.ringLabel).toBe('4B');
    });

    test('clasifica cambio de dirección como sensible', () => {
        const parsed = parseModificationPayload({
            street: 'Real',
            number: '456',
            postalCode: '1663',
            provinceId: '1',
        }, baseShipment);

        expect(parsed.hasSensitive).toBe(true);
        expect(parsed.sensitive.street).toBe('Real');
        expect(parsed.sensitive.number).toBe('456');
    });

    test('no detecta cambios si el payload coincide', () => {
        const parsed = parseModificationPayload({
            windowFrom: '09:00:00',
            windowTo: '13:00:00',
            deliveryMode: 'home',
            street: 'Falsa',
            number: '123',
        }, baseShipment);

        expect(parsed.hasDirect).toBe(false);
        expect(parsed.hasSensitive).toBe(false);
    });
});

describe('submitPortalModification()', () => {
    test('rechaza envío en estado no editable', async () => {
        const result = await submitPortalModification({
            shipment: { ...baseShipment, statusId: 4 },
            client: { document: 123, email: 'a@test.com' },
            body: { ringLabel: 'A' },
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(409);
    });

    test('exige sucursal cuando modalidad es branch_pickup', async () => {
        const result = await submitPortalModification({
            shipment: baseShipment,
            client: { document: 123, email: 'a@test.com' },
            body: { deliveryMode: 'branch_pickup' },
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toMatch(/sucursal/i);
    });

    test('aplica cambios directos y registra solicitud APPLIED', async () => {
        const result = await submitPortalModification({
            shipment: baseShipment,
            client: { document: 123, email: 'a@test.com' },
            body: { ringLabel: '4B', deliveryMode: 'home' },
        });

        expect(result.ok).toBe(true);
        expect(result.applied).toHaveLength(1);
        expect(result.pending).toHaveLength(0);
        expect(sequelize.transaction).toHaveBeenCalled();
        expect(Address.update).toHaveBeenCalled();
        expect(modificationRequestModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: ModificationRequestStatus.APPLIED }),
            expect.any(Object)
        );
        expect(shipmentHistoryModel.create).toHaveBeenCalled();
    });

    test('crea solicitud pendiente para cambio de dirección', async () => {
        const result = await submitPortalModification({
            shipment: baseShipment,
            client: { document: 123, email: 'a@test.com' },
            body: { street: 'Nueva', number: '999' },
        });

        expect(result.ok).toBe(true);
        expect(result.pending).toHaveLength(1);
        expect(modificationRequestModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: ModificationRequestStatus.PENDING_REVIEW }),
            expect.any(Object)
        );
    });
});

describe('approveRequest() / rejectRequest()', () => {
    test('aprueba solicitud pendiente y actualiza dirección', async () => {
        modificationRequestModel.findById.mockResolvedValueOnce({
            id: 7,
            shipmentId: 10,
            status: ModificationRequestStatus.PENDING_REVIEW,
            payload: { requested: { street: 'Aprobada', number: '1' } },
        });
        Shipment.findByPk.mockResolvedValueOnce({ ...baseShipment, toJSON: () => baseShipment });

        const result = await approveRequest(7, { id: 1, fullName: 'Operador' });

        expect(result.ok).toBe(true);
        expect(Address.update).toHaveBeenCalledWith(
            expect.objectContaining({ street: 'Aprobada' }),
            expect.any(Object)
        );
        expect(modificationRequestModel.updateById).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ status: ModificationRequestStatus.APPLIED }),
            expect.any(Object)
        );
    });

    test('rechaza solicitud pendiente con comentario', async () => {
        modificationRequestModel.findById.mockResolvedValueOnce({
            id: 8,
            shipmentId: 10,
            status: ModificationRequestStatus.PENDING_REVIEW,
            payload: { requested: { street: 'X' } },
        });
        Shipment.findByPk.mockResolvedValueOnce(baseShipment);

        const result = await rejectRequest(8, { id: 1 }, 'Dirección inválida');

        expect(result.ok).toBe(true);
        expect(modificationRequestModel.updateById).toHaveBeenCalledWith(
            8,
            expect.objectContaining({
                status: ModificationRequestStatus.REJECTED,
                reviewComment: 'Dirección inválida',
            }),
            expect.any(Object)
        );
    });
});
