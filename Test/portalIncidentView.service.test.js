jest.mock('../src/models/shipment', () => ({
    findByClientIdentity: jest.fn(),
    getById: jest.fn(),
}));

jest.mock('../src/models/incident', () => ({
    findByIdFull: jest.fn(),
    findByShipmentIds: jest.fn(),
}));

jest.mock('../src/services/portalClientAccess', () => ({
    assertClientOwnsShipment: jest.fn(),
}));

const shipmentModel = require('../src/models/shipment');
const incidentModel = require('../src/models/incident');
const { assertClientOwnsShipment } = require('../src/services/portalClientAccess');
const {
    statusLabel,
    resolutionLabel,
    formatIncidentRow,
    formatIncidentDetail,
    listClientIncidents,
    assertClientOwnsIncident,
    loadOwnedIncident,
} = require('../src/services/portalIncidentView');
const { IncidentStatus, IncidentResolution } = require('../src/constants/enums');

const client = { document: 12345678, email: 'cliente@test.com' };

const sampleIncident = {
    id: 5,
    shipmentId: 10,
    status: IncidentStatus.OPEN,
    resolution: null,
    description: 'Paquete dañado',
    createdAt: new Date('2026-06-01T12:00:00'),
    shipment: { id: 10, trackingId: 'ENV-010' },
    type: { description: 'Paquete dañado', code: 'PACKAGE_BROKEN' },
    toJSON() { return this; },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('statusLabel() / resolutionLabel()', () => {
    test('traduce estados para el cliente', () => {
        expect(statusLabel(IncidentStatus.OPEN)).toBe('Abierta');
        expect(statusLabel(IncidentStatus.IN_REVIEW)).toBe('En revisión');
        expect(statusLabel(IncidentStatus.CLOSED)).toBe('Cerrada');
    });

    test('traduce resoluciones', () => {
        expect(resolutionLabel(IncidentResolution.PROCEDENTE)).toBe('Procedente');
        expect(resolutionLabel(IncidentResolution.NO_PROCEDENTE)).toBe('No procedente');
    });
});

describe('formatIncidentRow() / formatIncidentDetail()', () => {
    test('formatea fila de listado', () => {
        const row = formatIncidentRow(sampleIncident);
        expect(row.id).toBe(5);
        expect(row.trackingId).toBe('ENV-010');
        expect(row.typeLabel).toBe('Paquete dañado');
        expect(row.statusLabel).toBe('Abierta');
        expect(row.statusKey).toBe('open');
    });

    test('formatea detalle con descripción', () => {
        const detail = formatIncidentDetail({
            ...sampleIncident,
            status: IncidentStatus.CLOSED,
            resolution: IncidentResolution.PROCEDENTE,
        });
        expect(detail.description).toBe('Paquete dañado');
        expect(detail.statusLabel).toBe('Cerrada');
        expect(detail.resolutionLabel).toBe('Procedente');
    });
});

describe('listClientIncidents()', () => {
    test('retorna vacío si el cliente no tiene envíos', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([]);
        const result = await listClientIncidents(client);
        expect(result).toEqual({ open: [], closed: [] });
        expect(incidentModel.findByShipmentIds).not.toHaveBeenCalled();
    });

    test('particiona incidencias abiertas y cerradas', async () => {
        shipmentModel.findByClientIdentity.mockResolvedValueOnce([{ id: 10 }]);
        incidentModel.findByShipmentIds
            .mockResolvedValueOnce([sampleIncident])
            .mockResolvedValueOnce([{
                ...sampleIncident,
                id: 6,
                status: IncidentStatus.CLOSED,
            }]);

        const result = await listClientIncidents(client);

        expect(result.open).toHaveLength(1);
        expect(result.closed).toHaveLength(1);
        expect(incidentModel.findByShipmentIds).toHaveBeenCalledWith([10], expect.objectContaining({ statusIn: expect.arrayContaining(['OPEN', 'IN_REVIEW']) }));
        expect(incidentModel.findByShipmentIds).toHaveBeenCalledWith([10], expect.objectContaining({ statusIn: ['CLOSED'] }));
    });
});

describe('assertClientOwnsIncident() / loadOwnedIncident()', () => {
    test('permite incidencia de envío propio', async () => {
        shipmentModel.getById.mockResolvedValueOnce({
            id: 10,
            sender: { document: 12345678, email: 'cliente@test.com' },
            recipient: { document: 999, email: 'otro@test.com' },
        });
        assertClientOwnsShipment.mockReturnValueOnce(true);
        const owns = await assertClientOwnsIncident(sampleIncident, client);
        expect(owns).toBe(true);
    });

    test('deniega incidencia de envío ajeno', async () => {
        shipmentModel.getById.mockResolvedValueOnce({
            id: 10,
            sender: { document: 1, email: 'a@test.com' },
            recipient: { document: 2, email: 'b@test.com' },
        });
        assertClientOwnsShipment.mockReturnValueOnce(false);
        const owns = await assertClientOwnsIncident(sampleIncident, client);
        expect(owns).toBe(false);
    });

    test('loadOwnedIncident retorna null si no hay ownership', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(sampleIncident);
        shipmentModel.getById.mockResolvedValueOnce({
            id: 10,
            sender: { document: 1, email: 'a@test.com' },
            recipient: { document: 2, email: 'b@test.com' },
        });
        assertClientOwnsShipment.mockReturnValueOnce(false);
        const result = await loadOwnedIncident(5, client);
        expect(result).toBeNull();
    });

    test('loadOwnedIncident retorna incidencia propia', async () => {
        incidentModel.findByIdFull.mockResolvedValueOnce(sampleIncident);
        shipmentModel.getById.mockResolvedValueOnce({
            id: 10,
            sender: { document: 12345678, email: 'cliente@test.com' },
            recipient: { document: 999, email: 'otro@test.com' },
        });
        assertClientOwnsShipment.mockReturnValueOnce(true);
        const result = await loadOwnedIncident(5, client);
        expect(result).toEqual(sampleIncident);
    });
});
