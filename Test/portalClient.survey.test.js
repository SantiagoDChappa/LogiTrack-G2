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

jest.mock('../src/services/portalSurveyService', () => ({
    getEligibleShipments: jest.fn(),
    isEligible: jest.fn(),
    submitSurvey: jest.fn(),
    getCompletedSurvey: jest.fn(),
}));

jest.mock('../src/models/shipment', () => ({
    getById: jest.fn(),
    findByClientIdentity: jest.fn(),
}));

const portalClientAccess = require('../src/services/portalClientAccess');
const surveyService = require('../src/services/portalSurveyService');
const shipmentModel = require('../src/models/shipment');
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

describe('GET /portal/mis-envios/encuestas', () => {
    test('redirige sin sesión', async () => {
        const res = await request(app).get('/portal/mis-envios/encuestas');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });

    test('muestra empty state sin encuestas', async () => {
        surveyService.getEligibleShipments.mockResolvedValueOnce({ pending: [], completed: [] });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('No existen encuestas disponibles');
    });

    test('muestra listado con pendientes', async () => {
        surveyService.getEligibleShipments.mockResolvedValueOnce({
            pending: [{
                shipmentId: 10,
                trackingId: 'ENV-010',
                recipientName: 'Juan Perez',
                createdAt: new Date('2026-06-01'),
            }],
            completed: [],
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-010');
        expect(res.text).toContain('Juan Perez');
        expect(res.text).toContain('Responder encuesta');
    });

    test('muestra completadas en tab correspondiente', async () => {
        surveyService.getEligibleShipments.mockResolvedValueOnce({
            pending: [],
            completed: [{
                shipmentId: 20,
                trackingId: 'ENV-020',
                recipientName: 'Ana López',
                createdAt: new Date('2026-06-01'),
            }],
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuestas?tab=completed')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('ENV-020');
        expect(res.text).toContain('Completada');
    });
});

describe('GET /portal/mis-envios/encuesta/:shipmentId', () => {
    test('muestra formulario para envío elegible', async () => {
        surveyService.isEligible.mockResolvedValueOnce({
            eligible: true,
            shipment: { id: 10, trackingId: 'ENV-010', recipient: { fullName: 'Juan' }, toJSON() { return this; } },
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta/10')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Enviar encuesta');
        expect(res.text).toContain('ENV-010');
    });

    test('muestra encuesta ya completada', async () => {
        surveyService.isEligible.mockResolvedValueOnce({
            eligible: false,
            reason: 'already_answered',
            survey: { id: 1, overallRating: 5, punctualityRating: 4, packageConditionRating: 3, serviceRating: 5, comment: 'Excelente' },
        });
        shipmentModel.getById.mockResolvedValueOnce({
            id: 10, trackingId: 'ENV-010', recipient: { fullName: 'Juan' }, toJSON() { return this; },
        });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta/10')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain('Ya respondiste esta encuesta');
        expect(res.text).toContain('Excelente');
    });

    test('devuelve 404 para envío ajeno', async () => {
        surveyService.isEligible.mockResolvedValueOnce({ eligible: false, reason: 'not_owner' });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta/99')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(404);
    });

    test('devuelve 400 para envío no terminal', async () => {
        surveyService.isEligible.mockResolvedValueOnce({ eligible: false, reason: 'not_terminal' });

        const res = await request(app)
            .get('/portal/mis-envios/encuesta/11')
            .set('Cookie', makeSessionCookie());

        expect(res.status).toBe(400);
        expect(res.text).toContain('no finalizó');
    });
});

describe('POST /portal/mis-envios/encuesta/:shipmentId', () => {
    test('registra y redirige con confirmación', async () => {
        surveyService.submitSurvey.mockResolvedValueOnce({ ok: true, surveyId: 1, shipmentId: 10 });

        const res = await request(app)
            .post('/portal/mis-envios/encuesta/10')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ overallRating: '5', punctualityRating: '4', packageConditionRating: '3', serviceRating: '4', comment: 'Ok' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios/encuesta/10?ok=1');
    });

    test('redirige con error para rating inválido', async () => {
        surveyService.submitSurvey.mockResolvedValueOnce({ ok: false, message: 'Rating inválido' });

        const res = await request(app)
            .post('/portal/mis-envios/encuesta/10')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ overallRating: '0' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('error=');
    });

    test('redirige con error para envío no elegible', async () => {
        surveyService.submitSurvey.mockResolvedValueOnce({ ok: false, message: 'Ya respondiste la encuesta' });

        const res = await request(app)
            .post('/portal/mis-envios/encuesta/10')
            .set('Cookie', makeSessionCookie())
            .type('form')
            .send({ overallRating: '5', punctualityRating: '4', packageConditionRating: '3', serviceRating: '4' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('error=');
    });

    test('requiere sesión', async () => {
        const res = await request(app)
            .post('/portal/mis-envios/encuesta/10')
            .type('form')
            .send({ overallRating: '5' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/portal/mis-envios');
    });
});
