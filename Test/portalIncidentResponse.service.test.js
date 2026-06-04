jest.mock('../src/database/connection', () => ({
    transaction: jest.fn((cb) => cb({})),
}));

jest.mock('../src/models/shipment', () => ({
    getById: jest.fn(),
}));

jest.mock('../src/models/incident', () => ({
    Incident: { update: jest.fn().mockResolvedValue([1]) },
}));

jest.mock('../src/models/incidentHistory', () => ({
    create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/models/incidentAttachment', () => ({
    IncidentAttachment: { create: jest.fn().mockResolvedValue({ id: 1 }) },
}));

jest.mock('../src/services/portalClientAccess', () => ({
    assertClientOwnsShipment: jest.fn(),
}));

const { Incident } = require('../src/models/incident');
const incidentHistoryModel = require('../src/models/incidentHistory');
const incidentAttachmentModel = require('../src/models/incidentAttachment');
const shipmentModel = require('../src/models/shipment');
const { assertClientOwnsShipment } = require('../src/services/portalClientAccess');
const {
    canClientInteract,
    validateAttachmentFile,
    submitClientResponse,
} = require('../src/services/portalIncidentResponseService');
const { IncidentStatus } = require('../src/constants/enums');

const client = { document: 12345678, email: 'cliente@test.com' };
const openIncident = {
    id: 5,
    shipmentId: 10,
    status: IncidentStatus.OPEN,
    toJSON() { return this; },
};
const closedIncident = {
    id: 6,
    shipmentId: 10,
    status: IncidentStatus.CLOSED,
    toJSON() { return this; },
};
const shipment = {
    id: 10,
    sender: { id: 1, document: 12345678, email: 'cliente@test.com' },
    recipient: { id: 2, document: 999, email: 'otro@test.com' },
};

beforeEach(() => {
    jest.clearAllMocks();
    shipmentModel.getById.mockResolvedValue(shipment);
    assertClientOwnsShipment.mockReturnValue(true);
});

describe('canClientInteract()', () => {
    test('permite OPEN e IN_REVIEW', () => {
        expect(canClientInteract(openIncident)).toBe(true);
        expect(canClientInteract({ status: IncidentStatus.IN_REVIEW })).toBe(true);
    });

    test('bloquea CLOSED', () => {
        expect(canClientInteract(closedIncident)).toBe(false);
    });
});

describe('validateAttachmentFile()', () => {
    test('rechaza mime inválido', () => {
        const result = validateAttachmentFile({
            mimetype: 'application/zip',
            size: 1000,
        });
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/JPG\/PNG/);
    });

    test('rechaza archivo demasiado grande', () => {
        const result = validateAttachmentFile({
            mimetype: 'image/jpeg',
            size: 6 * 1024 * 1024,
        });
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/5 MB/);
    });

    test('acepta archivo válido', () => {
        const result = validateAttachmentFile({
            mimetype: 'application/pdf',
            size: 1024,
        });
        expect(result.ok).toBe(true);
    });
});

describe('submitClientResponse()', () => {
    test('rechaza incidencia cerrada', async () => {
        const result = await submitClientResponse({
            incident: closedIncident,
            client,
            comment: 'Hola',
        });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(409);
    });

    test('exige comentario o archivo', async () => {
        const result = await submitClientResponse({
            incident: openIncident,
            client,
            comment: '   ',
        });
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/comentario o adjunt/);
    });

    test('registra comentario y pasa incidencia a IN_REVIEW', async () => {
        const result = await submitClientResponse({
            incident: openIncident,
            client,
            comment: 'Adjunto la factura solicitada',
        });

        expect(result.ok).toBe(true);
        expect(result.movedToReview).toBe(true);
        expect(incidentHistoryModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: 'COMMENT', personId: 1 })
        );
        expect(Incident.update).toHaveBeenCalledWith(
            { status: IncidentStatus.IN_REVIEW },
            expect.any(Object)
        );
    });

    test('registra adjunto PDF válido', async () => {
        const result = await submitClientResponse({
            incident: { ...openIncident, status: IncidentStatus.IN_REVIEW },
            client,
            comment: '',
            file: {
                originalname: 'foto.pdf',
                mimetype: 'application/pdf',
                size: 5000,
                buffer: Buffer.from('pdf'),
            },
        });

        expect(result.ok).toBe(true);
        expect(incidentAttachmentModel.IncidentAttachment.create).toHaveBeenCalledWith(
            expect.objectContaining({ source: 'PORTAL', uploadedByPersonId: 1 }),
            expect.any(Object)
        );
    });

    test('rechaza adjunto inválido', async () => {
        const result = await submitClientResponse({
            incident: openIncident,
            client,
            comment: '',
            file: {
                originalname: 'archivo.zip',
                mimetype: 'application/zip',
                size: 100,
                buffer: Buffer.from('x'),
            },
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
        expect(incidentAttachmentModel.IncidentAttachment.create).not.toHaveBeenCalled();
    });
});
