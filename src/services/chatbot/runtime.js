const { DEFAULT_SUPPORT } = require('./constants');
const {
    applyStatusExposurePolicy,
    CHATBOT_PUBLIC_POLICY,
    sanitizeChatbotComment,
} = require('./publicPolicy');

function asString(value, fallback = '') {
    return value === null || value === undefined ? fallback : String(value);
}

function normalizeHistoryItem(item) {
    const normalized = {
        changedAtLabel: asString(item?.changedAtLabel, '-'),
        fromStatus: item?.fromStatus ? asString(item.fromStatus) : null,
        toStatus: asString(item?.toStatus, '-'),
        comment: sanitizeChatbotComment(item?.comment),
        branchName: item?.branchName ? asString(item.branchName) : null,
        eventType: item?.eventType ? asString(item.eventType) : null,
    };

    return pickAllowedFields(normalized, CHATBOT_PUBLIC_POLICY.history.allow);
}

function normalizeIncidentItem(item) {
    const normalized = {
        id: asString(item?.id),
        typeLabel: asString(item?.typeLabel, 'Incidencia'),
        statusLabel: asString(item?.statusLabel, '-'),
        resolutionLabel: item?.resolutionLabel ? asString(item.resolutionLabel) : null,
        createdAtLabel: asString(item?.createdAtLabel, '-'),
        closedAtLabel: item?.closedAtLabel ? asString(item.closedAtLabel) : null,
    };

    return pickAllowedFields(normalized, CHATBOT_PUBLIC_POLICY.incidents.allow);
}

function normalizeShipment(shipment) {
    const normalized = {
        id: asString(shipment?.id),
        trackingId: asString(shipment?.trackingId, '-'),
        status: asString(shipment?.status, 'Sin estado'),
        statusKey: asString(shipment?.statusKey, 'default'),
        destination: asString(shipment?.destination, '-'),
        shipmentType: asString(shipment?.shipmentType, '-'),
        weightKg: asString(shipment?.weightKg, '-'),
        packageQty: asString(shipment?.packageQty, '-'),
        createdAtLabel: asString(shipment?.createdAtLabel, '-'),
        currentBranchName: shipment?.currentBranchName ? asString(shipment.currentBranchName) : null,
        expectedDeliveryDateLabel: shipment?.expectedDeliveryDateLabel ? asString(shipment.expectedDeliveryDateLabel) : null,
        expectedDeliveryWindow: shipment?.expectedDeliveryWindow ? asString(shipment.expectedDeliveryWindow) : null,
        lastMovementLabel: asString(shipment?.lastMovementLabel, 'Sin estado'),
        lastMovementDateLabel: shipment?.lastMovementDateLabel ? asString(shipment.lastMovementDateLabel) : null,
        lastComment: sanitizeChatbotComment(shipment?.lastComment),
        history: Array.isArray(shipment?.history)
            ? shipment.history.map(normalizeHistoryItem)
            : [],
        incidents: Array.isArray(shipment?.incidents)
            ? shipment.incidents.map(normalizeIncidentItem)
            : [],
    };

    return applyStatusExposurePolicy(
        pickAllowedFields(normalized, CHATBOT_PUBLIC_POLICY.modes.detail.allow)
    );
}

function pickAllowedFields(source, allowedFields) {
    return allowedFields.reduce((acc, field) => {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            acc[field] = source[field];
        }
        return acc;
    }, {});
}

function normalizeContext(context) {
    const support = context?.support || {};

    return {
        searched: Boolean(context?.searched),
        query: asString(context?.query),
        error: asString(context?.error),
        searchType: context?.searchType ? asString(context.searchType) : null,
        support: {
            email: asString(support.email, DEFAULT_SUPPORT.email),
            hours: asString(support.hours, DEFAULT_SUPPORT.hours),
        },
        shipments: Array.isArray(context?.shipments)
            ? context.shipments.map(normalizeShipment).filter((shipment) => shipment.id)
            : [],
    };
}

function findShipmentById(shipments, shipmentId) {
    return shipments.find((shipment) => shipment.id === String(shipmentId || '')) || null;
}

const INCIDENT_STEPS = new Set(['tracking', 'type', 'description', 'name', 'email', 'confirm']);

function normalizeIncidentDraft(rawDraft) {
    if (!rawDraft || typeof rawDraft !== 'object') { return null; }
    const step = INCIDENT_STEPS.has(rawDraft.step) ? rawDraft.step : null;
    if (!step) { return null; }
    return {
        step,
        trackingId:     rawDraft.trackingId     ? String(rawDraft.trackingId).slice(0, 40)  : null,
        incidentTypeId: rawDraft.incidentTypeId ? Number(rawDraft.incidentTypeId) || null   : null,
        incidentTypeLabel: rawDraft.incidentTypeLabel ? String(rawDraft.incidentTypeLabel).slice(0, 120) : null,
        description:    rawDraft.description    ? String(rawDraft.description).slice(0, 2000) : null,
        reporterName:   rawDraft.reporterName   ? String(rawDraft.reporterName).slice(0, 120) : null,
        reporterEmail:  rawDraft.reporterEmail  ? String(rawDraft.reporterEmail).slice(0, 160) : null,
    };
}

function normalizeState(rawState, shipments) {
    const requestedId = rawState?.selectedShipmentId ? String(rawState.selectedShipmentId) : null;
    const hasStoredSelection = requestedId && findShipmentById(shipments, requestedId);
    const autoSelectedId = shipments.length === 1 ? shipments[0].id : null;

    return {
        selectedShipmentId: autoSelectedId || (hasStoredSelection ? requestedId : null),
        pendingAction: rawState?.pendingAction ? String(rawState.pendingAction) : null,
        incidentDraft: normalizeIncidentDraft(rawState?.incidentDraft),
    };
}

function createRuntime(payload) {
    const context = normalizeContext(payload?.context || {});
    const state = normalizeState(payload?.state || {}, context.shipments);

    return {
        context,
        state,
    };
}

function getSelectedShipment(runtime) {
    if (!runtime.state.selectedShipmentId) { return null; }
    return findShipmentById(runtime.context.shipments, runtime.state.selectedShipmentId);
}

function setSelectedShipment(runtime, shipmentId) {
    const shipment = findShipmentById(runtime.context.shipments, shipmentId);
    if (!shipment) {
        runtime.state.selectedShipmentId = null;
        return null;
    }

    runtime.state.selectedShipmentId = shipment.id;
    return shipment;
}

module.exports = {
    createRuntime,
    findShipmentById,
    getSelectedShipment,
    normalizeContext,
    setSelectedShipment,
};
