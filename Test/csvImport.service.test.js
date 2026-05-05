const realGeocode = jest.requireActual('../src/services/geocode');

jest.mock('../src/models/person');
jest.mock('../src/models/address');
jest.mock('../src/models/shipment');
jest.mock('../src/models/shipmentHistory');
jest.mock('../src/services/geocode', () => ({
    geocodeAddress: jest.fn(),
    GeocodeError:   jest.requireActual('../src/services/geocode').GeocodeError,
}));

const personModel          = require('../src/models/person');
const addressModel         = require('../src/models/address');
const shipmentModel        = require('../src/models/shipment');
const shipmentHistoryModel = require('../src/models/shipmentHistory');
const { geocodeAddress }   = require('../src/services/geocode');
const { GeocodeError }     = realGeocode;

const csvImport = require('../src/services/csvImport');

const validRow = (status = 'Entregado') =>
    'Juan Perez,12345678,1123456789,juan@example.com,'
  + 'Maria Garcia,87654321,1198765432,maria@example.com,'
  + `Av. Corrientes,1234,3 B,24,C1043,1,2.5,1,${status}`;

const HEADER = 'senderName,senderDocument,senderPhone,senderEmail,'
             + 'recipientName,recipientDocument,recipientPhone,recipientEmail,'
             + 'street,number,floorApartment,province,postalCode,shipmentTypeId,weightKg,packageQty,status';

const buildCsv = (rows) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');

const setupHappyMocks = () => {
    let nextId = 1;
    personModel.createOrUpdate.mockImplementation(async (p) => ({ id: nextId++, ...p }));
    addressModel.create.mockImplementation(async (a) => ({ id: nextId++, ...a }));
    shipmentModel.create.mockImplementation(async (data) => ({
        id:         nextId,
        trackingId: `ENV-${String(nextId++).padStart(3, '0')}`,
        statusId:   data.statusId || 1,
    }));
    shipmentHistoryModel.create.mockResolvedValue({ id: 999 });
    geocodeAddress.mockResolvedValue({ lat: -34.6, lng: -58.4, postalCode: 'C1043' });
};

describe('csvImport.processBuffer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('importa una fila válida correctamente con statusId final', async () => {
        setupHappyMocks();
        const buffer = buildCsv([validRow('Entregado')]);

        const result = await csvImport.processBuffer(buffer, { userId: 7, throttleMs: 0 });

        expect(result.aborted).toBe(false);
        expect(result.total).toBe(1);
        expect(result.imported).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(personModel.createOrUpdate).toHaveBeenCalledTimes(2);
        expect(addressModel.create).toHaveBeenCalledTimes(1);
        expect(shipmentModel.create).toHaveBeenCalledWith(expect.objectContaining({ statusId: 4 }));
        expect(shipmentHistoryModel.create).toHaveBeenCalledWith(expect.objectContaining({
            eventType:  'CREATED',
            userId:     7,
            toStatusId: 4,
            comment:    expect.stringContaining('Importación masiva'),
        }));
    });

    test('status "Cancelado" crea el envío con statusId 5', async () => {
        setupHappyMocks();
        const buffer = buildCsv([validRow('Cancelado')]);

        const result = await csvImport.processBuffer(buffer, { userId: 7, throttleMs: 0 });

        expect(result.imported).toHaveLength(1);
        expect(shipmentModel.create).toHaveBeenCalledWith(expect.objectContaining({ statusId: 5 }));
    });

    test('status "Pendiente" rechaza la fila sin tocar la DB', async () => {
        setupHappyMocks();
        const buffer = buildCsv([validRow('Pendiente')]);

        const result = await csvImport.processBuffer(buffer, { userId: 7, throttleMs: 0 });

        expect(result.imported).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('status');
        expect(shipmentModel.create).not.toHaveBeenCalled();
    });

    test('mezcla filas válidas e inválidas e informa errores por fila', async () => {
        setupHappyMocks();
        const invalid = validRow().replace('12345678', '99'); // DNI inválido
        const buffer = buildCsv([validRow(), invalid, validRow()]);

        const result = await csvImport.processBuffer(buffer, { userId: 1, throttleMs: 0 });

        expect(result.aborted).toBe(false);
        expect(result.total).toBe(3);
        expect(result.imported).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3); // header + 2 → fila 3
        expect(result.errors[0].field).toBe('senderDocument');
    });

    test('captura error de geocoding y reporta la fila', async () => {
        setupHappyMocks();
        geocodeAddress.mockRejectedValueOnce(new GeocodeError('Dirección no encontrada en el servicio de geocodificación'));

        const buffer = buildCsv([validRow()]);
        const result = await csvImport.processBuffer(buffer, { userId: 1, throttleMs: 0 });

        expect(result.imported).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('address');
        expect(result.errors[0].message).toMatch(/no encontrada/i);
        expect(shipmentModel.create).not.toHaveBeenCalled();
    });

    test('CSV vacío devuelve aborted con mensaje', async () => {
        const buffer = Buffer.from(HEADER, 'utf-8');
        const result = await csvImport.processBuffer(buffer, { userId: 1, throttleMs: 0 });
        expect(result.aborted).toBe(true);
        expect(result.errors[0].message).toMatch(/no contiene filas/i);
    });

    test('CSV mal formado devuelve aborted', async () => {
        const buffer = Buffer.from('a,b,c\n"x', 'utf-8');
        const result = await csvImport.processBuffer(buffer, { userId: 1, throttleMs: 0 });
        expect(result.aborted).toBe(true);
        expect(result.errors[0].message).toMatch(/mal formado/i);
    });

    test('error de DB en fila se reporta sin abortar el resto', async () => {
        setupHappyMocks();
        shipmentModel.create.mockRejectedValueOnce(new Error('connection refused'));
        const buffer = buildCsv([validRow(), validRow()]);

        const result = await csvImport.processBuffer(buffer, { userId: 1, throttleMs: 0 });

        expect(result.imported).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('database');
    });
});

describe('csvImport.buildErrorReportCsv', () => {
    test('genera CSV con header y filas escapadas', () => {
        const csv = csvImport.buildErrorReportCsv([
            { row: 2, field: 'senderName', message: 'es obligatorio' },
            { row: 3, field: 'street',     message: 'tiene "comillas", y comas' },
        ]);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('fila,campo,mensaje');
        expect(lines[1]).toBe('2,senderName,es obligatorio');
        expect(lines[2]).toBe('3,street,"tiene ""comillas"", y comas"');
    });
});
