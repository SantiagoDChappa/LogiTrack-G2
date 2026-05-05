const realGeocode = jest.requireActual('../src/services/geocode');

jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
        create:  jest.fn(),
        update:  jest.fn(),
        destroy: jest.fn(),
    })),
}));

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

const HEADER = 'senderName,senderDocument,senderPhone,senderEmail,'
             + 'recipientName,recipientDocument,recipientPhone,recipientEmail,'
             + 'street,number,floorApartment,province,postalCode,shipmentTypeId,weightKg,packageQty,status,legacyTrackingId';

const validRow = ({ status = 'Entregado', legacy = '', recipientDoc = '87654321' } = {}) =>
    `Juan Perez,12345678,1123456789,juan@example.com,`
  + `Maria Garcia,${recipientDoc},1198765432,maria@example.com,`
  + `Av. Corrientes,1234,3 B,24,C1043,1,2.5,1,${status},${legacy}`;

const buildCsv = (rows) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');

const setupAnalyzeMocks = () => {
    geocodeAddress.mockResolvedValue({ lat: -34.6, lng: -58.4, postalCode: 'C1043' });
    shipmentModel.findByLegacyTrackingId.mockResolvedValue(null);
    shipmentModel.findPotentialDuplicate.mockResolvedValue(null);
};

const setupCommitMocks = () => {
    let nextId = 1;
    personModel.createOrUpdate.mockImplementation(async (p) => ({ id: nextId++, ...p }));
    addressModel.create.mockImplementation(async (a) => ({ id: nextId++, ...a }));
    shipmentModel.create.mockImplementation(async (data) => ({
        id:         nextId,
        trackingId: `ENV-${String(nextId++).padStart(3, '0')}`,
        statusId:   data.statusId || 1,
    }));
    shipmentHistoryModel.create.mockResolvedValue({ id: 999 });
};

describe('csvImport.analyzeBuffer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupAnalyzeMocks();
    });

    test('happy path: una fila válida queda con status ok', async () => {
        const buffer = buildCsv([validRow()]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.aborted).toBe(false);
        expect(result.total).toBe(1);
        expect(result.summary).toEqual({ ok: 1, invalid: 0, duplicates: 0 });
        expect(result.rows[0].status).toBe('ok');
        expect(result.rows[0].data.statusId).toBe(4);
    });

    test('fila inválida queda con status invalid sin tocar dedup', async () => {
        const buffer = buildCsv([validRow({ status: 'Pendiente' })]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.invalid).toBe(1);
        expect(result.rows[0].status).toBe('invalid');
        expect(shipmentModel.findByLegacyTrackingId).not.toHaveBeenCalled();
        expect(shipmentModel.findPotentialDuplicate).not.toHaveBeenCalled();
    });

    test('detecta duplicado por legacyTrackingId vs DB', async () => {
        shipmentModel.findByLegacyTrackingId.mockResolvedValue({ trackingId: 'ENV-042' });

        const buffer = buildCsv([validRow({ legacy: 'LEG-001' })]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.duplicates).toBe(1);
        expect(result.rows[0].status).toBe('duplicate');
        expect(result.rows[0].duplicateOf.source).toBe('db');
        expect(result.rows[0].duplicateOf.trackingId).toBe('ENV-042');
        expect(result.rows[0].duplicateOf.reason).toMatch(/legacyTrackingId/);
    });

    test('detecta duplicado por heurística vs DB cuando no hay legacyTrackingId', async () => {
        shipmentModel.findPotentialDuplicate.mockResolvedValue({ trackingId: 'ENV-100' });

        const buffer = buildCsv([validRow()]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.duplicates).toBe(1);
        expect(result.rows[0].duplicateOf.source).toBe('db');
        expect(result.rows[0].duplicateOf.trackingId).toBe('ENV-100');
        expect(result.rows[0].duplicateOf.reason).toMatch(/sender.*recipient/);
    });

    test('detecta duplicados intra-CSV (dos filas idénticas)', async () => {
        const buffer = buildCsv([validRow(), validRow()]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.ok).toBe(1);
        expect(result.summary.duplicates).toBe(1);
        expect(result.rows[0].status).toBe('ok');
        expect(result.rows[1].status).toBe('duplicate');
        expect(result.rows[1].duplicateOf.source).toBe('csv');
        expect(result.rows[1].duplicateOf.rowNumber).toBe(2);
    });

    test('intra-CSV con legacyTrackingId duplicado', async () => {
        const buffer = buildCsv([
            validRow({ legacy: 'LEG-X', recipientDoc: '87654321' }),
            validRow({ legacy: 'LEG-X', recipientDoc: '99999999' }),
        ]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.duplicates).toBe(1);
        expect(result.rows[1].status).toBe('duplicate');
        expect(result.rows[1].duplicateOf.source).toBe('csv');
        expect(result.rows[1].duplicateOf.reason).toMatch(/legacyTrackingId/);
    });

    test('CSV vacío devuelve aborted', async () => {
        const buffer = Buffer.from(HEADER, 'utf-8');
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        expect(result.aborted).toBe(true);
    });

    test('error de geocoding marca la fila como invalid', async () => {
        geocodeAddress.mockRejectedValueOnce(new GeocodeError('Dirección no encontrada en el servicio de geocodificación'));

        const buffer = buildCsv([validRow()]);
        const result = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });

        expect(result.summary.invalid).toBe(1);
        expect(result.rows[0].status).toBe('invalid');
        expect(result.rows[0].errors[0].field).toBe('address');
    });
});

describe('csvImport.commitAnalysis', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupAnalyzeMocks();
        setupCommitMocks();
    });

    test('importa solo filas ok cuando includeDuplicates es false', async () => {
        shipmentModel.findPotentialDuplicate
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ trackingId: 'ENV-100' });

        const buffer = buildCsv([
            validRow({ recipientDoc: '11111111' }),
            validRow({ recipientDoc: '22222222' }),
        ]);
        const analysis = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        const commit   = await csvImport.commitAnalysis(analysis, { userId: 7, includeDuplicates: false });

        expect(commit.imported).toHaveLength(1);
        expect(shipmentModel.create).toHaveBeenCalledTimes(1);
    });

    test('importa también duplicados cuando includeDuplicates es true', async () => {
        shipmentModel.findPotentialDuplicate
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ trackingId: 'ENV-100' });

        const buffer = buildCsv([
            validRow({ recipientDoc: '11111111' }),
            validRow({ recipientDoc: '22222222' }),
        ]);
        const analysis = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        const commit   = await csvImport.commitAnalysis(analysis, { userId: 7, includeDuplicates: true });

        expect(commit.imported).toHaveLength(2);
        expect(shipmentModel.create).toHaveBeenCalledTimes(2);
    });

    test('persiste legacyTrackingId al insertar el shipment', async () => {
        const buffer = buildCsv([validRow({ legacy: 'LEG-001' })]);
        const analysis = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        await csvImport.commitAnalysis(analysis, { userId: 7, includeDuplicates: false });

        expect(shipmentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            legacyTrackingId: 'LEG-001',
            statusId:         4,
        }));
    });

    test('no toca DB si todas las filas son inválidas', async () => {
        const buffer = buildCsv([validRow({ status: 'Pendiente' })]);
        const analysis = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        const commit   = await csvImport.commitAnalysis(analysis, { userId: 7 });

        expect(commit.imported).toHaveLength(0);
        expect(shipmentModel.create).not.toHaveBeenCalled();
    });

    test('error de DB en una fila se reporta sin abortar el resto', async () => {
        shipmentModel.create.mockRejectedValueOnce(new Error('connection refused'));

        const buffer = buildCsv([
            validRow({ recipientDoc: '11111111' }),
            validRow({ recipientDoc: '22222222' }),
        ]);
        const analysis = await csvImport.analyzeBuffer(buffer, { throttleMs: 0 });
        const commit   = await csvImport.commitAnalysis(analysis, { userId: 7 });

        expect(commit.imported).toHaveLength(1);
        expect(commit.errors).toHaveLength(1);
        expect(commit.errors[0].field).toBe('database');
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

describe('csvImport.buildResultFromAnalysisAndCommit', () => {
    test('combina errores de validación y commit en un único reporte', () => {
        const analysis = {
            total:   2,
            aborted: false,
            summary: { ok: 1, invalid: 1, duplicates: 0 },
            rows: [
                { rowNumber: 2, status: 'ok', data: {} },
                { rowNumber: 3, status: 'invalid', errors: [{ field: 'senderName', message: 'es obligatorio' }] },
            ],
        };
        const commit = {
            imported: [{ id: 1, trackingId: 'ENV-001' }],
            errors:   [],
        };

        const result = csvImport.buildResultFromAnalysisAndCommit(analysis, commit);
        expect(result.total).toBe(2);
        expect(result.imported).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3);
    });
});
