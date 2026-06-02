const JWT = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
    })),
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' },
}));

jest.mock('../src/controllers/portal', () => ({
    getPortal: (_req, res) => res.send('portal'),
    getPublicCreateForm: (_req, res) => res.send('incident-new'),
    createPublic: (_req, res) => res.send('create'),
    createPublicApi: (_req, res) => res.json({ ok: true }),
    confirmIncident: (_req, res) => res.send('confirm'),
    getIncidentTypesApi: (_req, res) => res.json([]),
    publicSuccess: (_req, res) => res.send('success'),
    getSelfServiceForm: (_req, res) => res.send('self'),
    saveSelfService: (_req, res) => res.send('saved'),
}));

jest.mock('../src/models/setting', () => ({
    get: jest.fn().mockResolvedValue('LogiTrack'),
}));

jest.mock('../src/services/portalClientAccess', () => ({
    COOKIE_NAME: 'portal_client',
    requestAccess: jest.fn(),
    confirmAccess: jest.fn(),
    assertClientOwnsShipment: jest.fn(),
    splitActiveHistorical: jest.fn(),
    verifyPortalClientSession: jest.fn(),
}));

jest.mock('../src/models/shipment', () => ({
    findByClientIdentity: jest.fn(),
    getById: jest.fn(),
}));

jest.mock('../src/services/portalShipmentView', () => ({
    enrichShipmentRecord: jest.fn(),
    canSelfService: jest.fn(),
}));

jest.mock('../src/models/branch', () => ({
    Branch: { findAll: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../src/models/province', () => ({
    getAll: jest.fn().mockResolvedValue([{ id: 1, description: 'Buenos Aires' }]),
}));

jest.mock('../src/models/deliveryTimeWindow', () => ({
    getActive: jest.fn().mockResolvedValue([{ fromTime: '09:00:00', toTime: '13:00:00', label: 'Mañana' }]),
}));

jest.mock('../src/services/portalModificationService', () => ({
    canModifyShipment: jest.fn(),
    submitPortalModification: jest.fn(),
    listByShipment: jest.fn().mockResolvedValue([]),
    changeTypeLabel: jest.fn((t) => t),
    statusLabel: jest.fn((s) => s),
    describeChanges: jest.fn(() => 'cambio'),
}));

const portalClientAccess = require('../src/services/portalClientAccess');
const shipmentModel = require('../src/models/shipment');
const portalModificationService = require('../src/services/portalModificationService');
const portalRoutes = require('../src/routes/portal');

process.env.JWT_SECRET = 'test-secret';

const app = express();
app.set('view engine', 'ejs');
app.set('views', require('path').join(__dirname, '..', 'src', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/', portalRoutes);

const makeSessionCookie = () => {
    const token = JWT.sign(
        { type: 'portal_client', document: 12345678, email: 'cliente@test.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
    return [`portal_client=${token}`];
};

const ownedShipment = {
    id: 5,
    trackingId: 'ENV-005',
    statusId: 1,
    status: { description: 'Pendiente' },
    deliveryMode: 'home',
    expectedDeliveryFrom: '09:00:00',
    expectedDeliveryTo: '13:00:00',
    address: { street: 'Falsa', number: '123', provinceId: 1 },
    sender: { document: 12345678, email: 'cliente@test.com' },
    recipient: { fullName: 'Dest', document: 12345678, email: 'cliente@test.com' },
    toJSON() { return this; },
};

beforeEach(() => {
    jest.clearAllMocks();
    portalClientAccess.verifyPortalClientSession.mockImplementation((token) => {
        try {
            const decoded = JWT.verify(token, process.env.JWT_SECRET);
            if (decoded.type !== 'portal_client') return null;
            return { document: decoded.document, email: decoded.email };
        } catch {
            return null;
        }
    });
});

describe('GET /portal/mis-envios/envio/:id/gestion', () => {
    test('devuelve 404 para envío ajeno', async () => {
        shipmentModel.getById.mockResolvedValueOnce(ownedShipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(false);

        const res = await request(app)
            .get('/portal/mis-envios/envio/5/gestion')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
    });

    test('muestra formulario de gestión para envío propio editable', async () => {
        shipmentModel.getById.mockResolvedValueOnce(ownedShipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(true);
        portalModificationService.canModifyShipment.mockReturnValueOnce(true);

        const res = await request(app)
            .get('/portal/mis-envios/envio/5/gestion')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Gestión del envío');
        expect(res.text).toContain('Cambio de dirección');
    });
});

describe('POST /portal/mis-envios/envio/:id/gestion', () => {
    test('devuelve 404 al intentar gestionar envío ajeno', async () => {
        shipmentModel.getById.mockResolvedValueOnce(ownedShipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(false);

        const res = await request(app)
            .post('/portal/mis-envios/envio/5/gestion')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ ringLabel: '4B' });

        expect(res.status).toBe(404);
        expect(portalModificationService.submitPortalModification).not.toHaveBeenCalled();
    });

    test('muestra confirmación con cambios aplicados', async () => {
        shipmentModel.getById.mockResolvedValueOnce(ownedShipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(true);
        portalModificationService.submitPortalModification.mockResolvedValueOnce({
            ok: true,
            shipmentId: 5,
            trackingId: 'ENV-005',
            applied: [{ id: 1, summary: 'referencias de domicilio' }],
            pending: [],
        });

        const res = await request(app)
            .post('/portal/mis-envios/envio/5/gestion')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ ringLabel: '4B', deliveryMode: 'home' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('Aplicados directamente');
        expect(res.text).toContain('referencias de domicilio');
    });

    test('muestra confirmación con solicitud pendiente de revisión', async () => {
        shipmentModel.getById.mockResolvedValueOnce(ownedShipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(true);
        portalModificationService.submitPortalModification.mockResolvedValueOnce({
            ok: true,
            shipmentId: 5,
            trackingId: 'ENV-005',
            applied: [],
            pending: [{ id: 2, summary: 'dirección de entrega' }],
        });

        const res = await request(app)
            .post('/portal/mis-envios/envio/5/gestion')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ street: 'Nueva calle', number: '999' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('Pendientes de revisión operativa');
        expect(res.text).toContain('dirección de entrega');
    });
});
