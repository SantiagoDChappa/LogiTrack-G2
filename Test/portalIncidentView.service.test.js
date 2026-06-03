jest.mock('../src/models/shipment', () => ({
    findByClientIdentity: jest.fn(),
    getById: jest.fn(),
}));

jest.mock('../src/models/incident', () => ({
    findByIdFull: jest.fn(),
    findByShipmentIds: jest.fn(),
}));

jest.mock('../src/models/incidentHistory', () => ({
    getByIncidentId: jest.fn(),
}));

jest.mock('../src/models/incidentAttachment', () => ({
    getMetaByIncidentId: jest.fn(),
}));

jest.mock('../src/services/portalClientAccess', () => ({
    assertClientOwnsShipment: jest.fn(),
}));

jest.mock('../src/services/portalIncidentResponseService', () => ({
    canClientInteract: jest.fn((incident) => {
        const status = incident?.status;
        return status === 'OPEN' || status === 'IN_REVIEW';
    }),
}));

const shipmentModel = require('../src/models/shipment');
const incidentModel = require('../src/models/incident');
const { assertClientOwnsShipment } = require('../src/services/portalClientAccess');
const incidentHistoryModel = require('../src/models/incidentHistory');
const incidentAttachmentModel = require('../src/models/incidentAttachment');
const {
    statusLabel,
    resolutionLabel,
    formatIncidentRow,
    formatIncidentDetail,
    listClientIncidents,
    assertClientOwnsIncident,
    loadOwnedIncident,
    computeLastUpdatedAt,
    loadIncidentDetailViewModel,
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

describe('computeLastUpdatedAt()', () => {
    test('retorna null si no hay datos', () => {
        expect(computeLastUpdatedAt([], [], null)).toBeNull();
    });

    test('retorna la fecha más reciente del historial', () => {
        const history = [
            { changedAt: '2026-06-03T10:00:00Z' },
            { changedAt: '2026-06-01T08:00:00Z' },
        ];
        const result = computeLastUpdatedAt(history, [], null);
        expect(result).toEqual(new Date('2026-06-03T10:00:00Z'));
    });

    test('retorna closedAt cuando es la más reciente', () => {
        const history = [{ changedAt: '2026-06-01T08:00:00Z' }];
        const attachments = [{ createdAt: '2026-06-02T09:00:00Z' }];
        const closedAt = '2026-06-05T18:00:00Z';
        const result = computeLastUpdatedAt(history, attachments, closedAt);
        expect(result).toEqual(new Date(closedAt));
    });

    test('retorna la fecha del último adjunto cuando es la más reciente', () => {
        const history = [{ changedAt: '2026-06-01T08:00:00Z' }];
        const attachments = [
            { createdAt: '2026-06-01T09:00:00Z' },
            { createdAt: '2026-06-04T12:00:00Z' },
        ];
        const result = computeLastUpdatedAt(history, attachments, null);
        expect(result).toEqual(new Date('2026-06-04T12:00:00Z'));
    });
});

describe('loadIncidentDetailViewModel() – lastUpdatedAt y resolución', () => {
    test('incluye lastUpdatedAt calculado del historial', async () => {
        const incident = {
            ...sampleIncident,
            closedAt: null,
        };
        incidentHistoryModel.getByIncidentId.mockResolvedValueOnce([
            { eventType: 'STATUS_CHANGE', changedAt: '2026-06-02T14:00:00Z', toJSON() { return this; } },
            { eventType: 'CREATED', changedAt: '2026-06-01T10:00:00Z', toJSON() { return this; } },
        ]);
        incidentAttachmentModel.getMetaByIncidentId.mockResolvedValueOnce([]);

        const vm = await loadIncidentDetailViewModel(incident);

        expect(vm.lastUpdatedAt).toEqual(new Date('2026-06-02T14:00:00Z'));
        expect(vm.closedAt).toBeNull();
        expect(vm.resolutionLabel).toBeNull();
    });

    test('incluye closedAt y resolutionLabel para incidencia cerrada', async () => {
        const closedIncident = {
            ...sampleIncident,
            status: 'CLOSED',
            resolution: 'PROCEDENTE',
            closedAt: '2026-06-03T18:00:00Z',
        };
        incidentHistoryModel.getByIncidentId.mockResolvedValueOnce([
            { eventType: 'CLOSED', changedAt: '2026-06-03T18:00:00Z', toValue: 'PROCEDENTE', toJSON() { return this; } },
        ]);
        incidentAttachmentModel.getMetaByIncidentId.mockResolvedValueOnce([]);

        const vm = await loadIncidentDetailViewModel(closedIncident);

        expect(vm.closedAt).toBe('2026-06-03T18:00:00Z');
        expect(vm.resolutionLabel).toBe('Procedente');
        expect(vm.lastUpdatedAt).toEqual(new Date('2026-06-03T18:00:00Z'));
        expect(vm.closedMessage).toBe('Esta incidencia ya no admite nuevas interacciones.');
    });
});
