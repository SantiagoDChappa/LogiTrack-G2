const {
    buildShipmentContextActions,
    buildShipmentSummary,
    createAction,
    createEffect,
    createMessage,
} = require('../responseBuilder');
const { setSelectedShipment } = require('../runtime');

function buildFocusShipmentResponse(runtime, shipmentId, options = {}) {
    const shipment = setSelectedShipment(runtime, shipmentId);

    if (!shipment) {
        return {
            shipment: null,
            messages: [
                createMessage({
                    text: 'No pude ubicar ese envio dentro de los resultados actuales.',
                    actions: [
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const announceText = options.announceText || 'Listo, tomo ' + shipment.trackingId + ' como envio activo.';
    const messages = options.announce === false
        ? []
        : [
            createMessage({
                text: announceText,
                html: buildShipmentSummary(shipment),
                actions: buildShipmentContextActions(shipment),
            }),
        ];

    return {
        shipment,
        messages,
        effects: [
            createEffect('focus-shipment', {
                shipmentId: shipment.id,
                scroll: options.scroll !== false,
            }),
        ],
    };
}

function buildFaqResponse() {
    return {
        messages: [
            createMessage({
                text: 'Te lleve a la seccion de preguntas frecuentes. Si despues queres seguir por aca, te doy una mano con la consulta que tengas.',
                actions: [
                    createAction('Volver al menu', 'show-main-menu'),
                ],
            }),
        ],
        effects: [
            createEffect('scroll-to', { targetId: 'portal-faq-section' }),
        ],
    };
}

function buildSupportSectionResponse() {
    return {
        messages: [
            createMessage({
                text: 'Te lleve a la seccion de contacto y soporte.',
                actions: [
                    createAction('Volver al menu', 'show-main-menu'),
                ],
            }),
        ],
        effects: [
            createEffect('scroll-to', { targetId: 'portal-support-section' }),
        ],
    };
}

function buildResultsResponse() {
    return {
        messages: [
            createMessage({
                text: 'Te lleve a los resultados que ya estan cargados en esta pagina.',
                actions: [
                    createAction('Volver al menu', 'show-main-menu'),
                ],
            }),
        ],
        effects: [
            createEffect('scroll-to', { targetId: 'portal-results-section' }),
        ],
    };
}

function buildLoginRedirectResponse() {
    return {
        messages: [],
        effects: [
            createEffect('navigate', { url: '/login' }),
        ],
    };
}

module.exports = {
    buildFaqResponse,
    buildFocusShipmentResponse,
    buildLoginRedirectResponse,
    buildResultsResponse,
    buildSupportSectionResponse,
};
