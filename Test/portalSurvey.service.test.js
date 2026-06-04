jest.mock('../src/models/shipment', () => ({
    findByClientIdentity: jest.fn(),
    getById: jest.fn(),
}));

jest.mock('../src/models/deliverySurvey', () => ({
    findByShipmentId: jest.fn(),
    findByShipmentIds: jest.fn(),
    create: jest.fn(),
}));

jest.mock('../src/services/portalClientAccess', () => ({
    assertClientOwnsShipment: jest.fn(),
}));

const shipmentModel = require('../src/models/shipment');
const surveyModel = require('../src/models/deliverySurvey');
const { assertClientOwnsShipment } = require('../src/services/portalClientAccess');
const {
    getEligibleShipments,
    isEligible,
    submitSurvey,
    getCompletedSurvey,
    validateRatings,
    isTerminal,
} = require('../src/services/portalSurveyService');

const client = { document: 12345678, email: 'cliente@test.com' };

const deliveredShipment = {
    id: 10, trackingId: 'ENV-010', statusId: 4,
    recipient: { fullName: 'Juan Perez' },
    createdAt: new Date('2026-06-01'),
    toJSON() { return this; },
};

const pendingShipment = {
    id: 11, trackingId: 'ENV-011', statusId: 1,
    recipient: { fullName: 'Ana López' },
    createdAt: new Date('2026-06-02'),
    toJSON() { return this; },
};

const validAnswers = {
    overallRating: '4',
    punctualityRating: '5',
    packageConditionRating: '3',
    serviceRating: '4',
    comment: 'Buen servicio',
};

beforeEach(() => {
    jest.clearAllMocks();
});

const cancelledShipment = {
    id: 12, trackingId: 'ENV-012', statusId: 5,
    recipient: { fullName: 'María García' },
    createdAt: new Date('2026-06-03'),
    toJSON() { return this; },
};

describe('isTerminal()', () => {
    test('retorna true para statusId 4 (Entregado)', () => {
        expect(isTerminal(deliveredShipment)).toBe(true);
    });
    test('retorna true para statusId 5 (Cancelado)', () => {
        expect(isTerminal(cancelledShipment)).toBe(true);
    });
    test('retorna false para statusId no terminal', () => {
        expect(isTerminal(pendingShipment)).toBe(false);
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
        const result = validateRatings({ ...validAnswers, punctualityRating: 'abc' });
        expect(result.ok).toBe(false);
    });
    test('rechaza comentario demasiado largo', () => {
        const result = validateRatings({ ...validAnswers, comment: 'x'.repeat(2001) });
        expect(result.ok).toBe(false);
    });
});

describe('getEligibleShipments()', () => {
    test('retorna vacío si no hay envíos', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([]);
        const result = await getEligibleShipments(client);
        expect(result).toEqual({ pending: [], completed: [] });
    });

    test('separa pendientes y completadas', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([deliveredShipment, { ...deliveredShipment, id: 20, trackingId: 'ENV-020', toJSON() { return this; } }]);
        surveyModel.findByShipmentIds.mockResolvedValueOnce([{ shipmentId: 20 }]);

        const result = await getEligibleShipments(client);
        expect(result.pending).toHaveLength(1);
        expect(result.pending[0].shipmentId).toBe(10);
        expect(result.completed).toHaveLength(1);
        expect(result.completed[0].shipmentId).toBe(20);
    });

    test('incluye envíos cancelados y excluye no terminales', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([deliveredShipment, cancelledShipment, pendingShipment]);
        surveyModel.findByShipmentIds.mockResolvedValueOnce([]);

        const result = await getEligibleShipments(client);
        expect(result.pending).toHaveLength(2);
        expect(result.pending.map((r) => r.shipmentId)).toEqual([10, 12]);
    });
});

describe('isEligible()', () => {
    test('retorna eligible para envío entregado propio sin encuesta', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce(null);

        const result = await isEligible(10, client);
        expect(result.eligible).toBe(true);
        expect(result.shipment).toBe(deliveredShipment);
    });

    test('rechaza envío no encontrado', async () => {
        shipmentModel.getById.mockResolvedValueOnce(null);
        const result = await isEligible(999, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_found');
    });

    test('rechaza envío ajeno', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(false);
        const result = await isEligible(10, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_owner');
    });

    test('acepta envío cancelado como elegible', async () => {
        shipmentModel.getById.mockResolvedValueOnce(cancelledShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce(null);
        const result = await isEligible(12, client);
        expect(result.eligible).toBe(true);
    });

    test('rechaza envío no terminal', async () => {
        shipmentModel.getById.mockResolvedValueOnce(pendingShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        const result = await isEligible(11, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('not_terminal');
    });

    test('rechaza envío con encuesta ya respondida', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce({ id: 1, shipmentId: 10 });
        const result = await isEligible(10, client);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('already_answered');
    });
});

describe('submitSurvey()', () => {
    test('crea encuesta para envío elegible', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce(null);
        surveyModel.create.mockResolvedValueOnce({ id: 1, shipmentId: 10 });

        const result = await submitSurvey(10, client, validAnswers);
        expect(result.ok).toBe(true);
        expect(result.surveyId).toBe(1);
        expect(surveyModel.create).toHaveBeenCalledWith(expect.objectContaining({
            shipmentId: 10,
            overallRating: 4,
            punctualityRating: 5,
            packageConditionRating: 3,
            serviceRating: 4,
            comment: 'Buen servicio',
        }));
    });

    test('rechaza rating inválido', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce(null);

        const result = await submitSurvey(10, client, { ...validAnswers, overallRating: '0' });
        expect(result.ok).toBe(false);
        expect(surveyModel.create).not.toHaveBeenCalled();
    });

    test('previene duplicados', async () => {
        shipmentModel.getById.mockResolvedValueOnce(deliveredShipment);
        assertClientOwnsShipment.mockReturnValueOnce(true);
        surveyModel.findByShipmentId.mockResolvedValueOnce({ id: 1, shipmentId: 10 });

        const result = await submitSurvey(10, client, validAnswers);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Ya respondiste');
        expect(surveyModel.create).not.toHaveBeenCalled();
    });
});

describe('getCompletedSurvey()', () => {
    test('retorna encuesta existente', async () => {
        const survey = { id: 1, shipmentId: 10, overallRating: 5 };
        surveyModel.findByShipmentId.mockResolvedValueOnce(survey);
        const result = await getCompletedSurvey(10);
        expect(result).toEqual(survey);
    });

    test('retorna null si no existe', async () => {
        surveyModel.findByShipmentId.mockResolvedValueOnce(null);
        const result = await getCompletedSurvey(10);
        expect(result).toBeNull();
    });
});
