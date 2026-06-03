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

jest.mock('../src/services/portalIncidentView', () => ({
    listClientIncidents: jest.fn(),
    formatIncidentDetail: jest.fn(),
    loadOwnedIncident: jest.fn(),
}));

const portalClientAccess = require('../src/services/portalClientAccess');
const portalIncidentView = require('../src/services/portalIncidentView');
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

describe('GET /portal/mis-envios/incidencias', () => {
    test('redirige sin sesión', async () => {
        const res = await request(app).get('/portal/mis-envios/incidencias');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });

    test('muestra empty state sin incidencias', async () => {
        portalIncidentView.listClientIncidents.mockResolvedValueOnce({ open: [], closed: [] });

        const res = await request(app)
            .get('/portal/mis-envios/incidencias')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('No existen incidencias registradas');
    });

    test('muestra listado con columnas requeridas', async () => {
        portalIncidentView.listClientIncidents.mockResolvedValueOnce({
            open: [{
                id: 1,
                shipmentId: 10,
                trackingId: 'ENV-010',
                typeLabel: 'Demora',
                createdAt: new Date('2026-06-01'),
                status: 'OPEN',
                statusLabel: 'Abierta',
                statusKey: 'open',
            }],
            closed: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/incidencias')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('#1');
        expect(res.text).toContain('ENV-010');
        expect(res.text).toContain('Demora');
        expect(res.text).toContain('Abierta');
        expect(res.text).toContain('Ver detalle');
    });
});

describe('GET /portal/mis-envios/incidencia/:id', () => {
    test('devuelve 404 para incidencia ajena', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce(null);

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/99')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
        expect(res.text).toContain('Incidencia no encontrada');
    });

    test('muestra detalle básico de incidencia propia', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce({ id: 1 });
        portalIncidentView.formatIncidentDetail.mockReturnValueOnce({
            id: 1,
            shipmentId: 10,
            trackingId: 'ENV-010',
            typeLabel: 'Demora',
            createdAt: new Date('2026-06-01'),
            status: 'OPEN',
            statusLabel: 'Abierta',
            statusKey: 'open',
            description: 'Llegó tarde el paquete',
            resolution: null,
            resolutionLabel: null,
        });

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/1')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Llegó tarde el paquete');
        expect(res.text).toContain('ENV-010');
        expect(res.text).toContain('Abierta');
        expect(portalIncidentView.loadOwnedIncident).toHaveBeenCalledWith(1, expect.objectContaining({ document: 12345678 }));
    });
});
