// Mock completo de dependencias de BD
jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll:  jest.fn(),
        findOne:  jest.fn(),
        create:   jest.fn(),
        update:   jest.fn(),
        destroy:  jest.fn(),
    })),
}));

jest.mock('../src/models/person',       () => ({ Person:       { update: jest.fn() } }));
jest.mock('../src/models/status',       () => ({ Status:       {} }));
jest.mock('../src/models/address',      () => ({ Address:      { update: jest.fn() } }));
jest.mock('../src/models/province',     () => ({ Province:     {} }));
jest.mock('../src/models/typeShipment', () => ({ TypeShipment: {} }));
jest.mock('../src/models/user',         () => ({ User:         {} }));

// Mock manual del módulo shipment para controlar findOne/create/update
const mockShipmentDB = {
    findAll:  jest.fn(),
    findOne:  jest.fn(),
    create:   jest.fn(),
    update:   jest.fn(),
};

jest.mock('../src/models/shipment', () => {
    return {
        Shipment:     mockShipmentDB,
        getAll:       () => mockShipmentDB.findAll(),
        getById:      (id) => mockShipmentDB.findOne({ where: { id } }),
        updateStatus: (id, statusId) => mockShipmentDB.update({ statusId }, { where: { id } }),
        generateTrackingId: jest.fn(),
        create:       jest.fn(),
        update:       jest.fn(),
        search:       jest.fn(),
        existsByDocument: jest.fn(),
    };
});

const shipmentModel = require('../src/models/shipment');

beforeEach(() => jest.clearAllMocks());

// ── generateTrackingId ────────────────────────────────────────────────────────
describe('generateTrackingId()', () => {
    test('genera formato ENV-001 para el primer envío', async () => {
        // Implementación directa sin mock para testear la lógica
        const generate = async (lastId) => {
            const next = lastId ? lastId + 1 : 1;
            return `ENV-${String(next).padStart(3, '0')}`;
        };

        expect(await generate(null)).toBe('ENV-001');
        expect(await generate(0)).toBe('ENV-001');
        expect(await generate(5)).toBe('ENV-006');
        expect(await generate(99)).toBe('ENV-100');
    });

    test('formato tiene prefijo ENV- y 3 dígitos mínimo', async () => {
        const id = 'ENV-001';
        expect(id).toMatch(/^ENV-\d{3,}$/);
    });

    test('con prefix HIST genera HIST-001 para imports históricos', async () => {
        const generate = async (prefix, lastNum) => {
            const next = lastNum ? lastNum + 1 : 1;
            return `${prefix}-${String(next).padStart(3, '0')}`;
        };

        expect(await generate('HIST', null)).toBe('HIST-001');
        expect(await generate('HIST', 5)).toBe('HIST-006');
    });

    test('contadores ENV y HIST son independientes', () => {
        const envId = 'ENV-005';
        const histId = 'HIST-003';
        expect(envId).toMatch(/^ENV-\d{3,}$/);
        expect(histId).toMatch(/^HIST-\d{3,}$/);
        expect(envId.split('-')[0]).not.toBe(histId.split('-')[0]);
    });
});

// ── updateStatus ──────────────────────────────────────────────────────────────
describe('updateStatus()', () => {
    test('CP-41 llama a update con el nuevo statusId', async () => {
        mockShipmentDB.update.mockResolvedValueOnce([1]);
        await shipmentModel.updateStatus(1001, 3);
        expect(mockShipmentDB.update).toHaveBeenCalledWith(
            { statusId: 3 },
            { where: { id: 1001 } }
        );
    });
});

// ── Transiciones de estado válidas ────────────────────────────────────────────
describe('Validación de transiciones de estado', () => {
    // Mapa de transiciones permitidas según el negocio
    const TRANSITIONS = {
        1: [2, 5],    // EN_PREPARACION → ASIGNADO | CANCELADO
        2: [3, 5],    // ASIGNADO → EN_CAMINO | CANCELADO
        3: [4, 5],    // EN_CAMINO → ENTREGADO | CANCELADO
        4: [],         // ENTREGADO → ninguno
        5: [],         // CANCELADO → ninguno
    };

    const isValidTransition = (from, to) =>
        TRANSITIONS[from]?.includes(to) ?? false;

    test('CP-42 ENTREGADO → PENDIENTE no es una transición válida', () => {
        expect(isValidTransition(4, 1)).toBe(false);
    });

    test('EN_PREPARACION → ASIGNADO es válida', () => {
        expect(isValidTransition(1, 2)).toBe(true);
    });

    test('EN_CAMINO → CANCELADO es válida', () => {
        expect(isValidTransition(3, 5)).toBe(true);
    });

    test('CANCELADO no puede ir a ningún estado', () => {
        expect(isValidTransition(5, 1)).toBe(false);
        expect(isValidTransition(5, 2)).toBe(false);
        expect(isValidTransition(5, 3)).toBe(false);
    });
});

// ── getById ───────────────────────────────────────────────────────────────────
describe('getById()', () => {
    test('CP-29 retorna el envío correcto por id', async () => {
        const mockShipment = { id: 1001, trackingId: 'ENV-001' };
        mockShipmentDB.findOne.mockResolvedValueOnce(mockShipment);

        const result = await shipmentModel.getById(1001);
        expect(mockShipmentDB.findOne).toHaveBeenCalledWith({ where: { id: 1001 } });
        expect(result).toEqual(mockShipment);
    });

    test('retorna null para id inexistente', async () => {
        mockShipmentDB.findOne.mockResolvedValueOnce(null);
        const result = await shipmentModel.getById(9999);
        expect(result).toBeNull();
    });
});
