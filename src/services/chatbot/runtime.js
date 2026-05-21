const { DEFAULT_SUPPORT } = require('./constants');

function asString(value, fallback = '') {
    return value === null || value === undefined ? fallback : String(value);
}

function normalizeHistoryItem(item) {
    return {
        changedAtLabel: asString(item?.changedAtLabel, '-'),
        fromStatus: item?.fromStatus ? asString(item.fromStatus) : null,
        toStatus: asString(item?.toStatus, '-'),
        comment: item?.comment ? asString(item.comment) : null,
        branchName: item?.branchName ? asString(item.branchName) : null,
        eventType: item?.eventType ? asString(item.eventType) : null,
    };
}

function normalizeShipment(shipment) {
    return {
        id: asString(shipment?.id),
        trackingId: asString(shipment?.trackingId, '-'),
        status: asString(shipment?.status, 'Sin estado'),
        statusKey: asString(shipment?.statusKey, 'default'),
        recipient: asString(shipment?.recipient, '-'),
        sender: asString(shipment?.sender, '-'),
        destination: asString(shipment?.destination, '-'),
        destinationAddress: asString(shipment?.destinationAddress, '-'),
        shipmentType: asString(shipment?.shipmentType, '-'),
        weightKg: asString(shipment?.weightKg, '-'),
        packageQty: asString(shipment?.packageQty, '-'),
        createdAtLabel: asString(shipment?.createdAtLabel, '-'),
        currentBranchName: shipment?.currentBranchName ? asString(shipment.currentBranchName) : null,
        expectedDeliveryDateLabel: shipment?.expectedDeliveryDateLabel ? asString(shipment.expectedDeliveryDateLabel) : null,
        expectedDeliveryWindow: shipment?.expectedDeliveryWindow ? asString(shipment.expectedDeliveryWindow) : null,
        hasLiveTracking: Boolean(shipment?.hasLiveTracking),
        activeRouteId: shipment?.activeRouteId ? asString(shipment.activeRouteId) : null,
        lastMovementLabel: asString(shipment?.lastMovementLabel, 'Sin estado'),
        lastMovementDateLabel: shipment?.lastMovementDateLabel ? asString(shipment.lastMovementDateLabel) : null,
        lastComment: shipment?.lastComment ? asString(shipment.lastComment) : null,
        history: Array.isArray(shipment?.history)
            ? shipment.history.map(normalizeHistoryItem)
            : [],
    };
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

function normalizeState(rawState, shipments) {
    const requestedId = rawState?.selectedShipmentId ? String(rawState.selectedShipmentId) : null;
    const hasStoredSelection = requestedId && findShipmentById(shipments, requestedId);
    const autoSelectedId = shipments.length === 1 ? shipments[0].id : null;

    return {
        selectedShipmentId: autoSelectedId || (hasStoredSelection ? requestedId : null),
        pendingAction: rawState?.pendingAction ? String(rawState.pendingAction) : null,
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
