const JWT = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

jest.mock('../src/database/connection', () => ({
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
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

const portalClientAccess = require('../src/services/portalClientAccess');
const shipmentModel = require('../src/models/shipment');
const { enrichShipmentRecord, canSelfService } = require('../src/services/portalShipmentView');
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

describe('GET /portal/mis-envios', () => {
    test('muestra formulario de identificación', async () => {
        const res = await request(app).get('/portal/mis-envios');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Mis envíos');
        expect(res.text).toContain('DNI');
    });
});

describe('POST /portal/mis-envios/acceso', () => {
    test('informa cuando no hay envíos vinculados', async () => {
        portalClientAccess.requestAccess.mockResolvedValueOnce({
            ok: false,
            code: 'no_shipments',
            message: 'No se encontraron envíos vinculados a esos datos.',
        });

        const res = await request(app)
            .post('/portal/mis-envios/acceso')
            .type('form')
            .send({ document: '99999999', email: 'no@test.com' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('No se encontraron envíos vinculados');
    });

    test('muestra pantalla pending cuando el acceso es válido', async () => {
        portalClientAccess.requestAccess.mockResolvedValueOnce({
            ok: true,
            pending: {
                email: 'cliente@test.com',
                expiresAt: new Date(Date.now() + 3600000),
                mailDelivered: true,
                devLink: null,
            },
        });

        const res = await request(app)
            .post('/portal/mis-envios/acceso')
            .type('form')
            .send({ document: '12345678', email: 'cliente@test.com' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('Revisá tu casilla de email');
    });
});

describe('GET /portal/mis-envios/lista', () => {
    test('redirige sin sesión', async () => {
        const res = await request(app).get('/portal/mis-envios/lista');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });

    test('muestra listado con sesión válida', async () => {
        const active = [{
            id: 1,
            trackingId: 'ENV-001',
            createdAt: new Date(),
            deliveryMode: 'home',
            recipient: { fullName: 'Juan' },
            status: { description: 'En Transito' },
            statusId: 2,
        }];
        shipmentModel.findByClientIdentity.mockResolvedValueOnce(active);
        portalClientAccess.splitActiveHistorical.mockReturnValueOnce({ active, historical: [] });

        const res = await request(app)
            .get('/portal/mis-envios/lista')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-001');
        expect(res.text).toContain('Ver detalle');
    });

    test('muestra estado vacío cuando no hay envíos', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([]);
        portalClientAccess.splitActiveHistorical.mockReturnValueOnce({ active: [], historical: [] });

        const res = await request(app)
            .get('/portal/mis-envios/lista')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('No se encontraron envíos vinculados');
    });
});

describe('GET /portal/mis-envios/envio/:id', () => {
    test('devuelve 404 para envío ajeno', async () => {
        shipmentModel.getById.mockResolvedValueOnce({
            id: 99,
            trackingId: 'ENV-099',
            sender: { document: 1, email: 'a@test.com' },
            recipient: { document: 2, email: 'b@test.com' },
        });
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(false);

        const res = await request(app)
            .get('/portal/mis-envios/envio/99')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
    });

    test('muestra detalle para envío propio', async () => {
        const shipment = {
            id: 1,
            trackingId: 'ENV-001',
            status: { description: 'En Transito' },
            statusId: 2,
            sender: { document: 12345678, email: 'cliente@test.com', fullName: 'Yo' },
            recipient: { fullName: 'Dest' },
            history: [],
            mapStops: [],
        };
        shipmentModel.getById.mockResolvedValueOnce(shipment);
        portalClientAccess.assertClientOwnsShipment.mockReturnValueOnce(true);
        enrichShipmentRecord.mockResolvedValueOnce({
            ...shipment,
            createdAt: new Date(),
            deliveryMode: 'home',
            history: [{
                changedAt: new Date(),
                toStatus: { description: 'En Transito' },
                fromStatus: { description: 'Pendiente' },
            }],
            mapStops: [],
        });
        canSelfService.mockReturnValueOnce(true);

        const res = await request(app)
            .get('/portal/mis-envios/envio/1')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-001');
        expect(res.text).toContain('Historial de estados');
    });
});
