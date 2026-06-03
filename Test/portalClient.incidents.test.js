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
    loadIncidentDetailViewModel: jest.fn(),
    loadOwnedIncident: jest.fn(),
}));

jest.mock('../src/services/portalIncidentResponseService', () => ({
    submitClientResponse: jest.fn(),
}));

jest.mock('../src/models/incidentAttachment', () => ({
    getById: jest.fn(),
}));

const portalClientAccess = require('../src/services/portalClientAccess');
const portalIncidentView = require('../src/services/portalIncidentView');
const portalIncidentResponseService = require('../src/services/portalIncidentResponseService');
const incidentAttachmentModel = require('../src/models/incidentAttachment');
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
        portalIncidentView.loadIncidentDetailViewModel.mockResolvedValueOnce({
            id: 1,
            shipmentId: 10,
            trackingId: 'ENV-010',
            typeLabel: 'Demora',
            createdAt: new Date('2026-06-01'),
            status: 'OPEN',
            statusLabel: 'Abierta',
            statusKey: 'open',
            description: 'Llegó tarde el paquete',
            canInteract: true,
            history: [],
            attachments: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/1')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Llegó tarde el paquete');
        expect(res.text).toContain('ENV-010');
        expect(res.text).toContain('Responder incidencia');
        expect(portalIncidentView.loadOwnedIncident).toHaveBeenCalledWith(1, expect.objectContaining({ document: 12345678 }));
    });
});

describe('POST /portal/mis-envios/incidencia/:id/responder', () => {
    test('redirige con confirmación cuando la respuesta es válida', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce({ id: 1 });
        portalIncidentResponseService.submitClientResponse.mockResolvedValueOnce({ ok: true, incidentId: 1 });

        const res = await request(app)
            .post('/portal/mis-envios/incidencia/1/responder')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ comment: 'Adjunto la info solicitada' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios/incidencia/1?ok=1');
    });

    test('devuelve 404 para incidencia ajena', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce(null);

        const res = await request(app)
            .post('/portal/mis-envios/incidencia/99/responder')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ comment: 'Hola' });

        expect(res.status).toBe(404);
    });
});

describe('GET /portal/mis-envios/incidencia/:id (seguimiento completo)', () => {
    test('muestra última actualización y resolución para incidencia cerrada', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce({ id: 2 });
        portalIncidentView.loadIncidentDetailViewModel.mockResolvedValueOnce({
            id: 2,
            shipmentId: 10,
            trackingId: 'ENV-010',
            typeLabel: 'Paquete dañado',
            createdAt: new Date('2026-06-01'),
            status: 'CLOSED',
            statusLabel: 'Cerrada',
            statusKey: 'closed',
            description: 'Caja rota',
            canInteract: false,
            closedMessage: 'Esta incidencia ya no admite nuevas interacciones.',
            resolution: 'PROCEDENTE',
            resolutionLabel: 'Procedente',
            closedAt: new Date('2026-06-03T18:00:00Z'),
            lastUpdatedAt: new Date('2026-06-03T18:00:00Z'),
            history: [
                { eventLabel: 'Incidencia cerrada', changedAt: '2026-06-03T18:00:00Z', authorLabel: 'Operador', isClient: false, detail: 'Procedente' },
                { eventLabel: 'Incidencia registrada', changedAt: '2026-06-01T10:00:00Z', authorLabel: 'Sistema', isClient: false, detail: '' },
            ],
            attachments: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/2')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Última actualización');
        expect(res.text).toContain('Resolución de la incidencia');
        expect(res.text).toContain('Procedente');
        expect(res.text).toContain('Fecha de cierre');
        expect(res.text).toContain('Cerrada');
        expect(res.text).toContain('ya no admite nuevas interacciones');
    });

    test('no muestra bloque de resolución para incidencia abierta', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce({ id: 3 });
        portalIncidentView.loadIncidentDetailViewModel.mockResolvedValueOnce({
            id: 3,
            shipmentId: 10,
            trackingId: 'ENV-010',
            typeLabel: 'Demora',
            createdAt: new Date('2026-06-01'),
            status: 'OPEN',
            statusLabel: 'Abierta',
            statusKey: 'open',
            description: 'Aún no llegó',
            canInteract: true,
            closedMessage: null,
            resolution: null,
            resolutionLabel: null,
            closedAt: null,
            lastUpdatedAt: null,
            history: [],
            attachments: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/3')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).not.toContain('Resolución de la incidencia');
        expect(res.text).not.toContain('Fecha de cierre');
        expect(res.text).not.toContain('Última actualización');
    });
});

describe('GET /portal/mis-envios/incidencia/:id/adjunto/:attId', () => {
    test('devuelve 404 si el adjunto no pertenece a la incidencia', async () => {
        portalIncidentView.loadOwnedIncident.mockResolvedValueOnce({ id: 1 });
        incidentAttachmentModel.getById.mockResolvedValueOnce({ id: 9, incidentId: 2, dataBase64: 'aGk=', mimeType: 'text/plain', fileName: 'x.txt' });

        const res = await request(app)
            .get('/portal/mis-envios/incidencia/1/adjunto/9')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
    });
});
