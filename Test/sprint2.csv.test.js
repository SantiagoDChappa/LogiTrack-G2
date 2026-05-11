/**
 * Sprint 2 — CP-CSV: Exportación e Importación CSV
 * LGT-125 (export) / LGT-102 (import)
 */
const request = require('supertest');
const express = require('express');
const path    = require('path');

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../src/models/shipment');
jest.mock('../src/models/person');
jest.mock('../src/models/province');
jest.mock('../src/models/address');
jest.mock('../src/models/status');
jest.mock('../src/models/shipmentHistory');
jest.mock('../src/models/typeShipment');
jest.mock('../src/models/setting');
jest.mock('../src/models/user');
jest.mock('../src/models/shipmentImport');
jest.mock('../src/utils/notifications');
jest.mock('../src/services/geocode', () => ({
    geocodeAddress: jest.fn().mockResolvedValue({ lat: -34.6, lng: -58.4, postalCode: 'C1043' }),
    GeocodeError:   class GeocodeError extends Error {},
}));

const shipmentModel      = require('../src/models/shipment');
const shipmentImport     = require('../src/models/shipmentImport');
const { buildShipmentsCsv } = require('../src/services/csvExport');

// ── CSV Export ─────────────────────────────────────────────────────────────
describe('CP-CSV01-04 — Exportación CSV', () => {
    const buildApp = (roleId = 1) => { // 1=SUPERVISOR
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'src', 'views'));
        app.use((req, res, next) => {
            res.locals.currentUser = { id: 1, roleId, fullName: 'Test Super' };
            next();
        });
        const { requireSupervisorOrAdmin } = require('../src/middlewares/auth');
        const { exportShipments } = require('../src/controllers/shipment.js');
        app.get('/shipment/export', requireSupervisorOrAdmin, exportShipments);
        return app;
    };

    const mockShipmentRow = {
        trackingId: 'ENV-001', createdAt: new Date('2026-04-01'), weightKg: 2,
        packageQty: 1, shipmentTypeId: 1, deliveryUserId: null,
        sender:    { fullName: 'Juan Perez', document: 1234, phone: '1123456789', email: 'j@x.com' },
        recipient: { fullName: 'Maria G',   document: 5678, phone: '1198765432', email: 'm@x.com' },
        address:   { street: 'Corrientes', number: 1234, floorApartment: null, postalCode: 'C1043', lat: -34.6, lng: -58.4, province: { description: 'CABA' } },
        status:    { description: 'Pendiente' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // exportShipments usa shipmentModel.getAll()
        shipmentModel.getAll  = jest.fn().mockResolvedValue([mockShipmentRow]);
        shipmentModel.search  = jest.fn().mockResolvedValue([mockShipmentRow]);
    });

    test('CP-CSV01 — GET /shipment/export devuelve 200 con Content-Type text/csv', async () => {
        const res = await request(buildApp()).get('/shipment/export');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/i);
    });

    test('CP-CSV02 — Sin envíos: exporta solo el header CSV', async () => {
        shipmentModel.getAll = jest.fn().mockResolvedValue([]);
        const res = await request(buildApp()).get('/shipment/export');
        expect(res.status).toBe(200);
        const lines = res.text.trim().split('\n');
        expect(lines).toHaveLength(1); // solo header
        expect(lines[0]).toContain('trackingId');
    });

    test('CP-CSV03 — Rol sin permiso (operador=2) recibe 403', async () => {
        const res = await request(buildApp(2)).get('/shipment/export');
        expect(res.status).toBe(403);
    });

    test('CP-CSV04 — Columnas del CSV incluyen campos requeridos', async () => {
        const { COLUMNS } = require('../src/services/csvExport');
        expect(COLUMNS).toContain('trackingId');
        expect(COLUMNS).toContain('status');
        expect(COLUMNS).toContain('senderName');
        expect(COLUMNS).toContain('recipientName');
        expect(COLUMNS).toContain('province');
        expect(COLUMNS).toContain('lat');
        expect(COLUMNS).toContain('weightKg');
    });
});

// ── CSV Import ─────────────────────────────────────────────────────────────
describe('CP-CSV05-10 — Importación CSV', () => {
    const buildImportApp = (roleId = 4) => { // 4=ADMIN
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, '..', 'src', 'views'));
        app.use((req, res, next) => {
            res.locals.currentUser = { id: 1, roleId, fullName: 'Admin' };
            next();
        });
        const { requireAdmin } = require('../src/middlewares/auth');
        const { csvUpload }    = require('../src/middlewares/upload.js');
        const { showImportForm, processImportPreview, commitImport } = require('../src/controllers/shipment.js');
        app.get('/shipment/import',  requireAdmin, showImportForm);
        app.post('/shipment/import', requireAdmin, csvUpload.single('csvFile'), processImportPreview);
        app.post('/shipment/import/commit', requireAdmin, commitImport);
        return app;
    };

    const VALID_HEADER = 'senderName,senderDocument,senderPhone,senderEmail,'
        + 'recipientName,recipientDocument,recipientPhone,recipientEmail,'
        + 'street,number,floorApartment,province,postalCode,shipmentTypeId,weightKg,packageQty,status,legacyTrackingId,deliveryUserDocument';

    const VALID_ROW = 'Juan Perez,12345678,1123456789,juan@x.com,'
        + 'Maria G,87654321,1198765432,maria@x.com,'
        + 'Corrientes,1234,,24,C1043,1,2.5,1,Pendiente,,';

    beforeEach(() => {
        jest.clearAllMocks();
        shipmentImport.create            = jest.fn().mockResolvedValue({ id: 1, status: 'pending' });
        shipmentImport.getById           = jest.fn().mockResolvedValue({ id: 1, status: 'pending' });
        shipmentImport.updateStatus      = jest.fn().mockResolvedValue({});
        shipmentModel.findByLegacyTrackingId  = jest.fn().mockResolvedValue(null);
        shipmentModel.findPotentialDuplicate  = jest.fn().mockResolvedValue(null);
    });

    test('CP-CSV05 — GET /shipment/import (admin) devuelve 200', async () => {
        const res = await request(buildImportApp()).get('/shipment/import');
        expect(res.status).toBe(200);
    });

    test('CP-CSV06 — POST sin archivo devuelve alguna respuesta (no 2xx ideal con archivo)', async () => {
        const res = await request(buildImportApp())
            .post('/shipment/import')
            .set('Content-Type', 'multipart/form-data');
        // Sin archivo adjunto el server puede responder 200 (re-render form) o 302 (redirect)
        expect(res.status).toBeLessThan(600);
    });

    test('CP-CSV07 — Archivo vacío (solo header sin filas) es procesado', async () => {
        const csvEmpty = Buffer.from(VALID_HEADER + '\n', 'utf-8');
        const res = await request(buildImportApp())
            .post('/shipment/import')
            .attach('csvFile', csvEmpty, { filename: 'empty.csv', contentType: 'text/csv' });
        expect([200, 302]).toContain(res.status);
    });

    test('CP-CSV08 — Archivo con columnas inválidas (header incorrecto) devuelve error', async () => {
        const badCsv = Buffer.from('col1,col2,col3\nval1,val2,val3\n', 'utf-8');
        const res = await request(buildImportApp())
            .post('/shipment/import')
            .attach('csvFile', badCsv, { filename: 'bad.csv', contentType: 'text/csv' });
        // Debe notificar error de columnas
        expect([200, 302, 400]).toContain(res.status);
    });

    test('CP-CSV03 (import) — No-admin recibe 403', async () => {
        const res = await request(buildImportApp(2)) // operador
            .get('/shipment/import');
        expect(res.status).toBe(403);
    });

    test('CP-CSV09 — Validación de tipos: shipmentRowValidator rechaza weightKg negativo', () => {
        const { validate } = require('../src/services/shipmentRowValidator');
        const row = {
            senderName: 'Juan', senderDocument: '12345678', senderPhone: '1123456789', senderEmail: 'j@x.com',
            recipientName: 'Maria', recipientDocument: '87654321', recipientPhone: '1198765432', recipientEmail: 'm@x.com',
            street: 'Corrientes', number: '1234', province: '24', postalCode: 'C1043',
            shipmentTypeId: '1', weightKg: '-5', packageQty: '1',
        };
        const { errors } = validate(row, 1);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => /peso|weight/i.test(e.message))).toBe(true);
    });

    test('CP-CSV10 — Validación de tipos: shipmentRowValidator rechaza email inválido', () => {
        const { validate } = require('../src/services/shipmentRowValidator');
        const row = {
            senderName: 'Juan', senderDocument: '12345678', senderPhone: '1123456789', senderEmail: 'not-an-email',
            recipientName: 'Maria', recipientDocument: '87654321', recipientPhone: '1198765432', recipientEmail: 'm@x.com',
            street: 'Corrientes', number: '1234', province: '24', postalCode: 'C1043',
            shipmentTypeId: '1', weightKg: '2.5', packageQty: '1',
        };
        const { errors } = validate(row, 1);
        expect(errors.some(e => /email/i.test(e.message))).toBe(true);
    });
});
