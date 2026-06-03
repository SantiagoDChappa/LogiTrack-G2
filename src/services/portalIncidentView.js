const shipmentModel = require('../models/shipment');
const incidentModel = require('../models/incident');
const { assertClientOwnsShipment } = require('./portalClientAccess');
const { IncidentStatus, IncidentResolution } = require('../constants/enums');

const OPEN_STATUSES = [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW];
const CLOSED_STATUSES = [IncidentStatus.CLOSED];

const incidentJson = (incident) => (typeof incident.toJSON === 'function' ? incident.toJSON() : incident);

const statusLabel = (status) => ({
    [IncidentStatus.OPEN]:      'Abierta',
    [IncidentStatus.IN_REVIEW]: 'En revisión',
    [IncidentStatus.CLOSED]:    'Cerrada',
}[status] || status);

const statusKey = (status) => String(status || '').toLowerCase().replace(/_/g, '-');

const resolutionLabel = (resolution) => ({
    [IncidentResolution.PROCEDENTE]:    'Procedente',
    [IncidentResolution.NO_PROCEDENTE]: 'No procedente',
}[resolution] || null);

const getClientShipmentIds = async (client) => {
    const shipments = await shipmentModel.findByClientIdentity({
        document: client.document,
        email: client.email,
    });
    return shipments.map((s) => {
        const json = typeof s.toJSON === 'function' ? s.toJSON() : s;
        return json.id;
    });
};

const listClientIncidents = async (client) => {
    const shipmentIds = await getClientShipmentIds(client);
    if (!shipmentIds.length) {
        return { open: [], closed: [] };
    }

    const [openRows, closedRows] = await Promise.all([
        incidentModel.findByShipmentIds(shipmentIds, { statusIn: OPEN_STATUSES }),
        incidentModel.findByShipmentIds(shipmentIds, { statusIn: CLOSED_STATUSES }),
    ]);

    return {
        open: openRows.map(formatIncidentRow),
        closed: closedRows.map(formatIncidentRow),
    };
};

const formatIncidentRow = (incident) => {
    const json = incidentJson(incident);
    return {
        id: json.id,
        shipmentId: json.shipmentId,
        trackingId: json.shipment?.trackingId || null,
        typeLabel: json.type?.description || json.type?.code || 'Incidencia',
        createdAt: json.createdAt,
        status: json.status,
        statusLabel: statusLabel(json.status),
        statusKey: statusKey(json.status),
    };
};

const formatIncidentDetail = (incident) => {
    const row = formatIncidentRow(incident);
    const json = incidentJson(incident);
    return {
        ...row,
        description: json.description || '',
        resolution: json.resolution || null,
        resolutionLabel: json.resolution ? resolutionLabel(json.resolution) : null,
        closedAt: json.closedAt || null,
    };
};

const assertClientOwnsIncident = async (incident, client) => {
    const json = incidentJson(incident);
    if (!json.shipmentId) { return false; }
    const shipment = await shipmentModel.getById(json.shipmentId);
    if (!shipment) { return false; }
    return assertClientOwnsShipment(shipment, client);
};

const loadOwnedIncident = async (incidentId, client) => {
    if (!incidentId) { return null; }
    const incident = await incidentModel.findByIdFull(incidentId);
    if (!incident) { return null; }
    const owns = await assertClientOwnsIncident(incident, client);
    if (!owns) { return null; }
    return incident;
};

module.exports = {
    getClientShipmentIds,
    listClientIncidents,
    formatIncidentRow,
    formatIncidentDetail,
    assertClientOwnsIncident,
    loadOwnedIncident,
    statusLabel,
    statusKey,
    resolutionLabel,
    OPEN_STATUSES,
    CLOSED_STATUSES,
};
