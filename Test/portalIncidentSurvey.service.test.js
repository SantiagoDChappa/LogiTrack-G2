jest.mock('../src/models/incident', () => ({
    findByIdFull: jest.fn(),
    findByShipmentIds: jest.fn(),
}));

jest.mock('../src/models/incidentSurvey', () => ({
    findByIncidentId: jest.fn(),
    findByIncidentIds: jest.fn(),
    create: jest.fn(),
}));

jest.mock('../src/services/portalIncidentView', () => ({
    assertClientOwnsIncident: jest.fn(),
    getClientShipmentIds: jest.fn(),
}));

const incidentModel = require('../src/models/incident');
const surveyModel = require('../src/models/incidentSurvey');
const { assertClientOwnsIncident, getClientShipmentIds } = require('../src/services/portalIncidentView');
const {
    getEligibleIncidents,
    isEligible,
    submitSurvey,
    getCompletedSurvey,
    validateRatings,
    isClosed,
} = require('../src/services/portalIncidentSurveyService');

const client = { document: 12345678, email: 'cliente@test.com' };

const closedIncident = {
    id: 1, shipmentId: 10, status: 'CLOSED',
    createdAt: new Date('2026-06-01'), closedAt: new Date('2026-06-02'),
    shipment: { trackingId: 'ENV-010' },
    type: { description: 'Daño', code: 'DAMAGE' },
    toJSON() { return this; },
};

const openIncident = {
    id: 2, shipmentId: 11, status: 'OPEN',
    createdAt: new Date('2026-06-01'), closedAt: null,
    shipment: { trackingId: 'ENV-011' },
    type: { description: 'Faltante', code: 'MISSING' },
    toJSON() { return this; },
};

const validAnswers = {
    overallRating: '4',
    resolutionTimeRating: '5',
    communicationRating: '3',
    outcomeRating: '4',
    comment: 'Buena resolución',
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('isClosed()', () => {
    test('retorna true para incidencia CLOSED', () => {
        expect(isClosed(closedIncident)).toBe(true);
    });
    test('retorna false para incidencia OPEN', () => {
        expect(isClosed(openIncident)).toBe(false);
    });
});

describe('validateRatings()', () => {
    test('acepta ratings válidos', () => {
        expect(validateRatings(validAnswers).ok).toBe(true);
    });
    test('rechaza rating fuera de rango', () => {
        const result = validateRatings({ ...validAnswers, overallRating: '6' });
        expect(result.ok).toBe(false);
    });
    test('rechaza rating no numérico', () => {
        const result = validateRatings({ ...validAnswers, communicationRating: 'abc' });
        expect(result.ok).toBe(false);
    });
    test('rechaza comentario demasiado largo', () => {
        const result = validateRatings({ ...validAnswers, comment: 'x'.repeat(2001) });
        expect(result.ok).toBe(false);
    });
});

describe('getEligibleIncidents()', () => {
    test('retorna vacío si no hay envíos del cliente', async () => {
        getClientShipmentIds.mockResolvedValueOnce([]);
        const result = await getEligibleIncidents(client);
        expect(result).toEqual({ pending: [], completed: [] });
    });

    test('retorna vacío si no hay incidencias cerradas', async () => {
        getClientShipmentIds.mockResolvedValueOnce([10, 11]);
        incidentModel.findByShipmentIds.mockResolvedValueOnce([]);
        const result = await getEligibleIncidents(client);
        expect(result).toEqual({ pending: [], completed: [] });
    });

    test('separa pendientes y completadas', async () => {
        const secondClosed = { ...closedIncident, id: 3, toJSON() { return this; } };
        getClientShipmentIds.mockResolvedValueOnce([10]);
        incidentModel.findByShipmentIds.mockResolvedValueOnce([closedIncident, secondClosed]);
        surveyModel.findByIncidentIds.mockResolvedValueOnce([{ incidentId: 3 }]);

        const result = await getEligibleIncidents(client);
        expect(result.pending).toHaveLength(1);
        expect(result.pending[0].incidentId).toBe(1);
        expect(result.completed).toHaveLength(1);
        expect(result.completed[0].incidentId).toBe(3);
    });
});

describe('isEligible()', () => {
    test('retorna eligible para incidencia cerrada propia sin encuesta', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        surveyModel.findByIncidentId.mockResolvedValueOnce(null);

        const result = await isEligible(1, client);
        expect(result.eligible).toBe(true);
        expect(result.incident).toBe(closedIncident);
    });

    test('rechaza incidencia no encontrada', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(null);
        const result = await isEligible(999, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_found');
    });

    test('rechaza incidencia ajena', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(false);
        const result = await isEligible(1, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_owner');
    });

    test('rechaza incidencia no cerrada', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(openIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        const result = await isEligible(2, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_closed');
    });

    test('rechaza incidencia con encuesta ya respondida', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        surveyModel.findByIncidentId.mockResolvedValueOnce({ id: 1, incidentId: 1 });
        const result = await isEligible(1, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('already_answered');
    });
});

describe('submitSurvey()', () => {
    test('crea encuesta para incidencia elegible', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        surveyModel.findByIncidentId.mockResolvedValueOnce(null);
        surveyModel.create.mockResolvedValueOnce({ id: 1, incidentId: 1 });

        const result = await submitSurvey(1, client, validAnswers);
        expect(result.ok).toBe(true);
        expect(result.surveyId).toBe(1);
        expect(surveyModel.create).toHaveBeenCalledWith(expect.objectContaining({
            incidentId: 1,
            overallRating: 4,
            resolutionTimeRating: 5,
            communicationRating: 3,
            outcomeRating: 4,
            comment: 'Buena resolución',
        }));
    });

    test('rechaza rating inválido', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        surveyModel.findByIncidentId.mockResolvedValueOnce(null);

        const result = await submitSurvey(1, client, { ...validAnswers, overallRating: '0' });
        expect(result.ok).toBe(false);
        expect(surveyModel.create).not.toHaveBeenCalled();
    });

    test('previene duplicados', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(closedIncident);
        assertClientOwnsIncident.mockResolvedValueOnce(true);
        surveyModel.findByIncidentId.mockResolvedValueOnce({ id: 1, incidentId: 1 });

        const result = await submitSurvey(1, client, validAnswers);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Ya respondiste');
        expect(surveyModel.create).not.toHaveBeenCalled();
    });
});

describe('getCompletedSurvey()', () => {
    test('retorna encuesta existente', async () => {
        const survey = { id: 1, incidentId: 1, overallRating: 5 };
        surveyModel.findByIncidentId.mockResolvedValueOnce(survey);
        const result = await getCompletedSurvey(1);
        expect(result).toEqual(survey);
    });

    test('retorna null si no existe', async () => {
        surveyModel.findByIncidentId.mockResolvedValueOnce(null);
        const result = await getCompletedSurvey(1);
        expect(result).toBeNull();
    });
});
