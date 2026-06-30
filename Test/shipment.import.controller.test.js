const request = require('supertest');
const express = require('express');
const path    = require('path');

jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
        create:  jest.fn(),
        update:  jest.fn(),
        destroy: jest.fn(),
    })),
}));

jest.mock('../src/models/shipment');
jest.mock('../src/models/person');
jest.mock('../src/models/province');
jest.mock('../src/models/address');
jest.mock('../src/models/status');
jest.mock('../src/models/shipmentHistory');
jest.mock('../src/models/shipmentImport');
jest.mock('../src/models/typeShipment');
jest.mock('../src/models/setting');
jest.mock('../src/models/user');
jest.mock('../src/services/geocode');
jest.mock('../src/utils/notifications');
jest.mock('../src/services/zoneResolver.service', () => ({
    resolveZone: jest.fn().mockResolvedValue(null),
}));

const personModel          = require('../src/models/person');
const addressModel         = require('../src/models/address');
const shipmentModel        = require('../src/models/shipment');
const shipmentHistoryModel = require('../src/models/shipmentHistory');
const shipmentImportModel  = require('../src/models/shipmentImport');
const { geocodeAddress }   = require('../src/services/geocode');

const shipmentRoutes = require('../src/routes/shipment');

const HEADER = 'senderName,senderDocument,senderPhone,senderEmail,'
             + 'recipientName,recipientDocument,recipientPhone,recipientEmail,'
             + 'street,number,floorApartment,province,postalCode,shipmentTypeId,weightKg,packageQty,status';

const validRow = () =>
    'Juan Perez,12345678,1123456789,juan@example.com,'
  + 'Maria Garcia,87654321,1198765432,maria@example.com,'
  + 'Av. Corrientes,1234,3 B,24,C1043,1,2.5,1,Entregado';

const buildApp = (currentUser) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'src', 'views'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
        res.locals.currentUser = currentUser;
        next();
    });
    app.use('/shipment', shipmentRoutes);
    return app;
};

const setupHappyMocks = () => {
    let nextId = 1;
    personModel.createOrUpdate.mockImplementation(async (p) => ({ id: nextId++, ...p }));
    addressModel.create.mockImplementation(async (a) => ({ id: nextId++, ...a }));
    shipmentModel.create.mockImplementation(async (data) => ({
        id:         nextId,
        trackingId: `ENV-${String(nextId++).padStart(3, '0')}`,
        statusId:   data.statusId || 1,
    }));
    shipmentModel.findByLegacyTrackingId.mockResolvedValue(null);
    shipmentModel.findPotentialDuplicate.mockResolvedValue(null);
    shipmentHistoryModel.create.mockResolvedValue({});
    shipmentImportModel.create.mockResolvedValue({ id: 1 });
    geocodeAddress.mockResolvedValue({ lat: -34.6, lng: -58.4, postalCode: 'C1043' });
};

describe('POST /shipment/import (RBAC + flujo completo)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('repartidor recibe 403', async () => {
        const app = buildApp({ id: 1, roleId: 3, fullName: 'Repartidor' });
        const csv = [HEADER, validRow()].join('\n');

        const res = await request(app)
            .post('/shipment/import')
            .attach('csvFile', Buffer.from(csv), 'envios.csv');

        expect(res.status).toBe(403);
    });

    test('operador recibe 403 (solo admin importa)', async () => {
        const app = buildApp({ id: 9, roleId: 2, fullName: 'Operador Test' });
        const csv = [HEADER, validRow()].join('\n');

        const res = await request(app)
            .post('/shipment/import')
            .attach('csvFile', Buffer.from(csv), 'envios.csv');

        expect(res.status).toBe(403);
    });

    test('supervisor recibe 403', async () => {
        const app = buildApp({ id: 1, roleId: 1, fullName: 'Supervisor' });
        const csv = [HEADER, validRow()].join('\n');

        const res = await request(app)
            .post('/shipment/import')
            .attach('csvFile', Buffer.from(csv), 'envios.csv');

        expect(res.status).toBe(403);
    });

    test('admin sube CSV y ve el preview (no importa todavía)', async () => {
        setupHappyMocks();
        shipmentModel.findByLegacyTrackingId.mockResolvedValue(null);
        shipmentModel.findPotentialDuplicate.mockResolvedValue(null);
        const app = buildApp({ id: 9, roleId: 4, fullName: 'Admin Test' });
        const csv = [HEADER, validRow()].join('\n');

        const res = await request(app)
            .post('/shipment/import')
            .attach('csvFile', Buffer.from(csv), 'envios.csv');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Preview de importación');
        expect(shipmentModel.create).not.toHaveBeenCalled();
        expect(shipmentImportModel.create).not.toHaveBeenCalled();
    });

    test('sin archivo devuelve la vista con error', async () => {
        const app = buildApp({ id: 1, roleId: 4, fullName: 'Admin' });
        const res = await request(app).post('/shipment/import');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Debe seleccionar un archivo CSV');
    });
});

describe('POST /shipment/import/commit', () => {
    let previewId;
    let app;

    beforeEach(async () => {
        jest.clearAllMocks();
        setupHappyMocks();
        app = buildApp({ id: 9, roleId: 4, fullName: 'Admin Test' });

        const csv = [HEADER, validRow()].join('\n');
        const previewRes = await request(app)
            .post('/shipment/import')
            .attach('csvFile', Buffer.from(csv), 'envios.csv');

        const match = previewRes.text.match(/name="previewId"\s+value="([^"]+)"/);
        previewId = match ? match[1] : null;
    });

    test('commit con previewId válido importa y muestra resultado', async () => {
        expect(previewId).toBeTruthy();

        const res = await request(app)
            .post('/shipment/import/commit')
            .send(`previewId=${previewId}&force=false`);

        expect(res.status).toBe(200);
        expect(res.text).toContain('Resultado de la importación');
        expect(shipmentModel.create).toHaveBeenCalledTimes(1);
        expect(shipmentImportModel.create).toHaveBeenCalledWith(expect.objectContaining({
            userId:        9,
            filename:      'envios.csv',
            totalRows:     1,
            importedCount: 1,
            errorCount:    0,
            aborted:       false,
        }));
    });

    test('commit con previewId inválido devuelve 410 con mensaje', async () => {
        const res = await request(app)
            .post('/shipment/import/commit')
            .send('previewId=uuid-inexistente&force=false');

        expect(res.status).toBe(410);
        expect(res.text).toContain('expiró');
    });

    test('operador recibe 403 en commit', async () => {
        const opApp = buildApp({ id: 5, roleId: 2, fullName: 'Operador' });
        const res = await request(opApp)
            .post('/shipment/import/commit')
            .send(`previewId=${previewId}&force=false`);
        expect(res.status).toBe(403);
    });
});

describe('GET /shipment/import', () => {
    test('admin accede al formulario', async () => {
        const app = buildApp({ id: 1, roleId: 4, fullName: 'Admin' });
        const res = await request(app).get('/shipment/import');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Importación masiva');
    });

    test('operador recibe 403', async () => {
        const app = buildApp({ id: 9, roleId: 2, fullName: 'Operador' });
        const res = await request(app).get('/shipment/import');
        expect(res.status).toBe(403);
    });

    test('repartidor recibe 403', async () => {
        const app = buildApp({ id: 1, roleId: 3, fullName: 'Repartidor' });
        const res = await request(app).get('/shipment/import');
        expect(res.status).toBe(403);
    });
});

describe('GET /shipment/import/history (solo admin)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        shipmentImportModel.getAll.mockResolvedValue([
            {
                id: 1, userId: 9, filename: 'envios.csv',
                totalRows: 5, importedCount: 4, errorCount: 1, aborted: false,
                createdAt: new Date('2026-05-04T10:00:00Z'),
                user: { id: 9, fullName: 'Admin Test' },
            },
        ]);
    });

    test('admin ve el listado', async () => {
        const app = buildApp({ id: 1, roleId: 4, fullName: 'Admin' });
        const res = await request(app).get('/shipment/import/history');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Historial de importes');
        expect(res.text).toContain('envios.csv');
    });

    test('operador recibe 403', async () => {
        const app = buildApp({ id: 9, roleId: 2, fullName: 'Operador' });
        const res = await request(app).get('/shipment/import/history');
        expect(res.status).toBe(403);
    });

    test('supervisor recibe 403', async () => {
        const app = buildApp({ id: 1, roleId: 1, fullName: 'Supervisor' });
        const res = await request(app).get('/shipment/import/history');
        expect(res.status).toBe(403);
    });
});

describe('GET /shipment/export (admin + supervisor)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        shipmentModel.getAll.mockResolvedValue([
            {
                trackingId: 'ENV-001',
                createdAt:  new Date('2026-04-01'),
                weightKg:   1, packageQty: 1, shipmentTypeId: 1, deliveryUserId: null,
                sender:    { fullName: 'A', document: 11111111, phone: '', email: '' },
                recipient: { fullName: 'B', document: 22222222, phone: '', email: '' },
                address:   { street: 'Calle', number: 1, floorApartment: '', postalCode: '',
                             lat: null, lng: null, province: { description: 'CABA' } },
                status:    { description: 'Pendiente' },
            },
        ]);
    });

    test('admin descarga el CSV', async () => {
        const app = buildApp({ id: 1, roleId: 4, fullName: 'Admin' });
        const res = await request(app).get('/shipment/export');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.headers['content-disposition']).toMatch(/attachment.*envios-/);
        expect(res.text).toContain('trackingId');
        expect(res.text).toContain('ENV-001');
        expect(res.text).toContain('Pendiente');
    });

    test('supervisor descarga el CSV', async () => {
        const app = buildApp({ id: 1, roleId: 1, fullName: 'Supervisor' });
        const res = await request(app).get('/shipment/export');
        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-001');
    });

    test('operador recibe 403', async () => {
        const app = buildApp({ id: 9, roleId: 2, fullName: 'Operador' });
        const res = await request(app).get('/shipment/export');
        expect(res.status).toBe(403);
    });

    test('repartidor recibe 403', async () => {
        const app = buildApp({ id: 1, roleId: 3, fullName: 'Repartidor' });
        const res = await request(app).get('/shipment/export');
        expect(res.status).toBe(403);
    });
});
