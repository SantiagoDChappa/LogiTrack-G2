const { resolveTextIntent } = require('./intentResolver');
const { createRuntime, getSelectedShipment } = require('./runtime');
const generalHandlers = require('./handlers/general');
const navigationHandlers = require('./handlers/navigation');
const shipmentHandlers = require('./handlers/shipment');
const statusHandlers = require('./handlers/status');
const supportHandlers = require('./handlers/support');

const ACTION_SELECTION_REASONS = {
    'show-status': 'ver el estado actual',
    'show-location': 'ver la ubicacion y el recorrido',
    'show-eta': 'consultar la fecha estimada',
    'show-history': 'ver el historial',
    'show-issues': 'revisar incidencias',
    'show-branch': 'revisar sucursal o retiro',
    'show-pod': 'revisar el comprobante',
    'show-delivery-issue': 'revisar un problema con la entrega',
};

const ACTIONS_REQUIRING_SELECTION = new Set(Object.keys(ACTION_SELECTION_REASONS));

const ACTION_HANDLERS = {
    'request-lookup': (runtime) => generalHandlers.buildRequestLookupResponse(runtime),
    'show-main-menu': (runtime) => generalHandlers.buildMainMenuResponse(runtime),
    'show-understand-menu': (runtime) => generalHandlers.buildUnderstandMenuResponse(runtime),
    'show-location-menu': (runtime) => generalHandlers.buildLocationMenuResponse(runtime),
    'show-problem-menu': (runtime) => generalHandlers.buildProblemMenuResponse(runtime),
    'show-delivery-menu': (runtime) => generalHandlers.buildDeliveryMenuResponse(runtime),
    'show-management-menu': (runtime) => generalHandlers.buildManagementMenuResponse(runtime),
    'show-status': (runtime) => statusHandlers.buildStatusResponse(getSelectedShipment(runtime)),
    'show-status-guide': (runtime, value) => statusHandlers.buildStatusGuideResponse(value || ''),
    'show-location': (runtime) => shipmentHandlers.buildLocationResponse(getSelectedShipment(runtime)),
    'show-eta': (runtime) => shipmentHandlers.buildEtaResponse(getSelectedShipment(runtime)),
    'show-history': (runtime) => shipmentHandlers.buildHistoryResponse(getSelectedShipment(runtime)),
    'show-issues': (runtime) => shipmentHandlers.buildIssuesResponse(getSelectedShipment(runtime)),
    'show-branch': (runtime) => shipmentHandlers.buildBranchResponse(getSelectedShipment(runtime)),
    'show-pod': (runtime) => shipmentHandlers.buildPodResponse(getSelectedShipment(runtime)),
    'show-delivery-issue': (runtime) => shipmentHandlers.buildDeliveryIssueResponse(getSelectedShipment(runtime)),
    'show-management': (runtime) => shipmentHandlers.buildManagementResponse(getSelectedShipment(runtime)),
    'show-notifications': (runtime) => shipmentHandlers.buildNotificationsResponse(getSelectedShipment(runtime)),
    'show-support': (runtime) => supportHandlers.buildSupportResponse(runtime.context.support, getSelectedShipment(runtime)),
    'scroll-faq': () => navigationHandlers.buildFaqResponse(),
    'go-support': () => navigationHandlers.buildSupportSectionResponse(),
    'go-results': () => navigationHandlers.buildResultsResponse(),
    'go-login': () => navigationHandlers.buildLoginRedirectResponse(),
};

function mergeResponses(...responses) {
    return responses.reduce((acc, response) => {
        acc.messages.push(...(response?.messages || []));
        acc.effects.push(...(response?.effects || []));
        return acc;
    }, { messages: [], effects: [] });
}

function buildFinalResponse(runtime, response) {
    return {
        messages: response.messages || [],
        effects: response.effects || [],
        state: {
            selectedShipmentId: runtime.state.selectedShipmentId,
            pendingAction: runtime.state.pendingAction,
        },
    };
}

function runAction(runtime, action, value, options = {}) {
    if (action === 'focus-shipment') {
        return handleFocusShipment(runtime, value);
    }

    if (!options.preservePending) {
        runtime.state.pendingAction = null;
    }

    if (
        ACTIONS_REQUIRING_SELECTION.has(action)
        && runtime.context.shipments.length > 1
        && !getSelectedShipment(runtime)
    ) {
        runtime.state.pendingAction = action;
        return generalHandlers.buildSelectionPromptResponse(runtime, ACTION_SELECTION_REASONS[action]);
    }

    const handler = ACTION_HANDLERS[action];
    if (!handler) {
        return generalHandlers.buildFallbackResponse();
    }

    return handler(runtime, value);
}

function handleFocusShipment(runtime, value) {
    const focusResponse = navigationHandlers.buildFocusShipmentResponse(runtime, value, {
        announce: true,
        scroll: true,
    });

    if (!focusResponse.shipment) {
        runtime.state.pendingAction = null;
        return focusResponse;
    }

    if (runtime.state.pendingAction) {
        const pendingAction = runtime.state.pendingAction;
        runtime.state.pendingAction = null;
        const followUp = runAction(runtime, pendingAction, '', { preservePending: true });
        return mergeResponses(focusResponse, followUp);
    }

    return focusResponse;
}

function runText(runtime, text) {
    runtime.state.pendingAction = null;

    const intent = resolveTextIntent(text);
    if (intent.kind === 'lookup') {
        return generalHandlers.buildLookupSubmitResponse(runtime, intent.query);
    }

    if (intent.kind === 'action') {
        return runAction(runtime, intent.action, intent.value || '');
    }

    return generalHandlers.buildFallbackResponse();
}

function handleChatbotRequest(payload) {
    const runtime = createRuntime(payload);
    const input = payload?.input || {};
    const type = String(input.type || 'message');

    if (type === 'init') {
        return buildFinalResponse(runtime, generalHandlers.buildInitResponse(runtime));
    }

    if (type === 'action') {
        return buildFinalResponse(runtime, runAction(runtime, String(input.action || ''), input.value || ''));
    }

    return buildFinalResponse(runtime, runText(runtime, input.text || ''));
}

module.exports = {
    handleChatbotRequest,
};
