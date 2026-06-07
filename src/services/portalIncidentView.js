const shipmentModel = require('../models/shipment');
const incidentModel = require('../models/incident');
const incidentHistoryModel = require('../models/incidentHistory');
const incidentAttachmentModel = require('../models/incidentAttachment');
const { assertClientOwnsShipment } = require('./portalClientAccess');
const { canClientInteract } = require('./portalIncidentResponseService');
const { IncidentStatus, IncidentResolution, IncidentEventType, IncidentChannel } = require('../constants/enums');

const CLIENT_VISIBLE_EVENTS = new Set([
    IncidentEventType.CREATED,
    IncidentEventType.COMMENT,
    IncidentEventType.EVIDENCE_ADDED,
    IncidentEventType.STATUS_CHANGE,
    IncidentEventType.CLOSED,
    IncidentEventType.REOPENED,
]);

const OPEN_STATUSES = [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW];
const CLOSED_STATUSES = [IncidentStatus.CLOSED];
// CP-CINC01: incidencias autogeneradas por el sistema no se exponen en el portal del cliente.
const PORTAL_EXCLUDED_CHANNELS = [IncidentChannel.SYSTEM];

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
        incidentModel.findByShipmentIds(shipmentIds, { statusIn: OPEN_STATUSES, excludeChannels: PORTAL_EXCLUDED_CHANNELS }),
        incidentModel.findByShipmentIds(shipmentIds, { statusIn: CLOSED_STATUSES, excludeChannels: PORTAL_EXCLUDED_CHANNELS }),
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
        canInteract: canClientInteract(incident),
    };
};

const historyEventLabel = (eventType) => ({
    [IncidentEventType.CREATED]:        'Incidencia registrada',
    [IncidentEventType.COMMENT]:        'Comentario',
    [IncidentEventType.EVIDENCE_ADDED]: 'Evidencia adjuntada',
    [IncidentEventType.STATUS_CHANGE]:  'Cambio de estado',
    [IncidentEventType.CLOSED]:         'Incidencia cerrada',
    [IncidentEventType.REOPENED]:       'Incidencia reabierta',
}[eventType] || 'Actualización');

const historyAuthorLabel = (entry) => {
    if (entry.personId || entry.person) {
        return entry.person?.fullName || 'Cliente';
    }
    if (entry.userId || entry.user) {
        return entry.user?.fullName || 'Operador';
    }
    return 'Sistema';
};

const formatHistoryDetail = (entry) => {
    const json = typeof entry.toJSON === 'function' ? entry.toJSON() : entry;
    let detail = json.comment || '';

    if (json.eventType === IncidentEventType.STATUS_CHANGE) {
        const from = statusLabel(json.fromValue) || json.fromValue;
        const to = statusLabel(json.toValue) || json.toValue;
        detail = detail || `${from || '-'} → ${to || '-'}`;
    }
    if (json.eventType === IncidentEventType.CLOSED && json.toValue) {
        detail = detail || resolutionLabel(json.toValue) || json.toValue;
    }

    return {
        id: json.id,
        changedAt: json.changedAt,
        eventType: json.eventType,
        eventLabel: historyEventLabel(json.eventType),
        authorLabel: historyAuthorLabel(json),
        isClient: Boolean(json.personId || json.person),
        detail,
    };
};

const formatAttachmentRow = (attachment, incidentId) => {
    const json = typeof attachment.toJSON === 'function' ? attachment.toJSON() : attachment;
    return {
        id: json.id,
        fileName: json.fileName,
        mimeType: json.mimeType,
        source: json.source,
        createdAt: json.createdAt,
        downloadUrl: `/portal/mis-envios/incidencia/${incidentId}/adjunto/${json.id}`,
        isImage: String(json.mimeType || '').startsWith('image/'),
    };
};

const computeLastUpdatedAt = (history, attachments, closedAt) => {
    const dates = [];
    if (history.length) dates.push(new Date(history[0].changedAt));
    if (attachments.length) dates.push(new Date(attachments[attachments.length - 1].createdAt));
    if (closedAt) dates.push(new Date(closedAt));
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
};

const loadIncidentDetailViewModel = async (incident) => {
    const json = incidentJson(incident);
    const base = formatIncidentDetail(incident);
    const [historyRows, attachmentRows] = await Promise.all([
        incidentHistoryModel.getByIncidentId(json.id),
        incidentAttachmentModel.getMetaByIncidentId(json.id),
    ]);

    const history = historyRows
        .filter((row) => CLIENT_VISIBLE_EVENTS.has(row.eventType))
        .map(formatHistoryDetail);

    const attachments = attachmentRows.map((row) => formatAttachmentRow(row, json.id));
    const lastUpdatedAt = computeLastUpdatedAt(historyRows, attachmentRows, json.closedAt);

    return {
        ...base,
        canInteract: canClientInteract(incident),
        closedMessage: canClientInteract(incident)
            ? null
            : 'Esta incidencia ya no admite nuevas interacciones.',
        history,
        attachments,
        lastUpdatedAt,
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
    // CP-CINC01: las incidencias SYSTEM no son visibles en el portal ni siquiera por URL directa.
    const json = incidentJson(incident);
    if (PORTAL_EXCLUDED_CHANNELS.includes(json.openedChannel)) { return null; }
    const owns = await assertClientOwnsIncident(incident, client);
    if (!owns) { return null; }
    return incident;
};

module.exports = {
    getClientShipmentIds,
    listClientIncidents,
    formatIncidentRow,
    formatIncidentDetail,
    loadIncidentDetailViewModel,
    computeLastUpdatedAt,
    formatHistoryDetail,
    formatAttachmentRow,
    assertClientOwnsIncident,
    loadOwnedIncident,
    statusLabel,
    statusKey,
    resolutionLabel,
    OPEN_STATUSES,
    CLOSED_STATUSES,
    CLIENT_VISIBLE_EVENTS,
};
