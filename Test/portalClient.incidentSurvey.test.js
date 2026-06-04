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
    getClientShipmentIds: jest.fn(),
    assertClientOwnsIncident: jest.fn(),
}));

jest.mock('../src/services/portalIncidentResponseService', () => ({
    submitClientResponse: jest.fn(),
}));

jest.mock('../src/models/incidentAttachment', () => ({
    getById: jest.fn(),
}));

jest.mock('../src/services/portalSurveyService', () => ({
    getEligibleShipments: jest.fn().mockResolvedValue({ pending: [], completed: [] }),
    isEligible: jest.fn(),
    submitSurvey: jest.fn(),
    getCompletedSurvey: jest.fn(),
}));

jest.mock('../src/services/portalIncidentSurveyService', () => ({
    getEligibleIncidents: jest.fn(),
    isEligible: jest.fn(),
    submitSurvey: jest.fn(),
}));

jest.mock('../src/models/shipment', () => ({
    getById: jest.fn(),
    findByClientIdentity: jest.fn(),
}));

jest.mock('../src/models/incident', () => ({
    findByIdFull: jest.fn(),
    findByShipmentIds: jest.fn(),
}));

const portalClientAccess = require('../src/services/portalClientAccess');
const incidentSurveyService = require('../src/services/portalIncidentSurveyService');
const incidentModel = require('../src/models/incident');
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

describe('GET /portal/mis-envios/encuestas-incidencias', () => {
    test('redirige sin sesión', async () => {
        const res = await request(app).get('/portal/mis-envios/encuestas-incidencias');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });

    test('muestra empty state sin encuestas', async () => {
        incidentSurveyService.getEligibleIncidents.mockResolvedValueOnce({ pending: [], completed: [] });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas-incidencias')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('No existen encuestas disponibles');
    });

    test('muestra listado con pendientes', async () => {
        incidentSurveyService.getEligibleIncidents.mockResolvedValueOnce({
            pending: [{
                incidentId: 1,
                trackingId: 'ENV-010',
                typeLabel: 'Daño',
                closedAt: new Date('2026-06-02'),
            }],
            completed: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas-incidencias')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-010');
        expect(res.text).toContain('Responder encuesta');
    });

    test('muestra completadas en tab correspondiente', async () => {
        incidentSurveyService.getEligibleIncidents.mockResolvedValueOnce({
            pending: [],
            completed: [{
                incidentId: 3,
                trackingId: 'ENV-010',
                typeLabel: 'Daño',
                closedAt: new Date('2026-06-02'),
            }],
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas-incidencias?tab=completed')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Completada');
    });
});

describe('GET /portal/mis-envios/encuesta-incidencia/:incidentId', () => {
    test('muestra formulario para incidencia elegible', async () => {
        incidentSurveyService.isEligible.mockResolvedValueOnce({
            eligible: true,
            incident: {
                id: 1, shipmentId: 10, status: 'CLOSED',
                shipment: { trackingId: 'ENV-010' },
                type: { description: 'Daño', code: 'DAMAGE' },
                toJSON() { return this; },
            },
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta-incidencia/1')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Enviar encuesta');
        expect(res.text).toContain('Incidencia #1');
    });

    test('muestra encuesta ya completada', async () => {
        incidentSurveyService.isEligible.mockResolvedValueOnce({
            eligible: false,
            reason: 'already_answered',
            survey: { id: 1, overallRating: 5, resolutionTimeRating: 4, communicationRating: 3, outcomeRating: 5, comment: 'Excelente' },
        });
        incidentModel.findByIdFull.mockResolvedValueOnce({
            id: 1, shipmentId: 10, status: 'CLOSED',
            shipment: { trackingId: 'ENV-010' },
            type: { description: 'Daño' },
            toJSON() { return this; },
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta-incidencia/1')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Ya respondiste esta encuesta');
        expect(res.text).toContain('Excelente');
    });

    test('devuelve 404 para incidencia no encontrada', async () => {
        incidentSurveyService.isEligible.mockResolvedValueOnce({ eligible: false, reason: 'not_found' });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta-incidencia/999')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
    });

    test('devuelve 400 para incidencia no cerrada', async () => {
        incidentSurveyService.isEligible.mockResolvedValueOnce({ eligible: false, reason: 'not_closed' });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta-incidencia/2')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(400);
        expect(res.text).toContain('no fue resuelta');
    });
});

describe('POST /portal/mis-envios/encuesta-incidencia/:incidentId', () => {
    test('registra y redirige con confirmación', async () => {
        incidentSurveyService.submitSurvey.mockResolvedValueOnce({ ok: true, surveyId: 1, incidentId: 1 });

        const res = await request(app)
            .post('/portal/mis-envios/encuesta-incidencia/1')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ overallRating: '5', resolutionTimeRating: '4', communicationRating: '3', outcomeRating: '4', comment: 'Ok' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios/encuesta-incidencia/1?ok=1');
    });

    test('redirige con error para rating inválido', async () => {
        incidentSurveyService.submitSurvey.mockResolvedValueOnce({ ok: false, message: 'Rating inválido' });

        const res = await request(app)
            .post('/portal/mis-envios/encuesta-incidencia/1')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ overallRating: '0' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('error=');
    });

    test('requiere sesión', async () => {
        const res = await request(app)
            .post('/portal/mis-envios/encuesta-incidencia/1')
            .type('form')
            .send({ overallRating: '5' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });
});
