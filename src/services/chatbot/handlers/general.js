const {
    buildMainMenuMessage,
    buildShipmentContextActions,
    buildShipmentSelectionActions,
    buildShipmentSummary,
    createAction,
    createEffect,
    createMessage,
} = require('../responseBuilder');
const { normalizeText } = require('../utils');

function buildInitResponse(runtime) {
    const messages = [
        createMessage({
            text: 'Soy el asistente del portal publico. Te puedo ayudar con seguimiento, estados, historial, incidencias, sucursales, entregas y soporte.',
        }),
    ];
    const effects = [];
    const selectedShipment = runtime.state.selectedShipmentId
        ? runtime.context.shipments.find((shipment) => shipment.id === runtime.state.selectedShipmentId) || null
        : null;

    if (selectedShipment) {
        effects.push(createEffect('focus-shipment', {
            shipmentId: selectedShipment.id,
            scroll: false,
        }));
    }

    if (runtime.context.error) {
        messages.push(createMessage({
            text: runtime.context.error + ' Si queres, probamos otra busqueda o revisamos opciones del portal.',
            actions: [
                createAction('Buscar otro envio', 'request-lookup'),
                createAction('Preguntas frecuentes', 'scroll-faq'),
                createAction('Hablar con soporte', 'show-support'),
            ],
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    if (runtime.context.shipments.length === 1) {
        const shipment = runtime.context.shipments[0];
        messages.push(createMessage({
            text: 'Ya tome este envio como referencia.',
            html: buildShipmentSummary(shipment),
            actions: buildShipmentContextActions(shipment),
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    if (runtime.context.shipments.length > 1) {
        messages.push(createMessage({
            text: 'Encontre varios envios para esta busqueda. Elegi cual queres revisar o segui con una consulta general.',
            actions: buildShipmentSelectionActions(runtime.context.shipments),
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    if (runtime.context.searched && runtime.context.shipments.length === 0) {
        messages.push(createMessage({
            text: 'No veo resultados cargados para esta consulta. Si queres, proba con otro tracking, busca por DNI o anda a soporte.',
            actions: [
                createAction('Buscar un envio', 'request-lookup'),
                createAction('Hablar con soporte', 'show-support'),
            ],
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    messages.push(createMessage({
        text: 'Para arrancar, escribi un numero de seguimiento como ENV-001 o el DNI del destinatario.',
        actions: [
            createAction('Buscar un envio', 'request-lookup'),
            createAction('Ver preguntas frecuentes', 'scroll-faq'),
        ],
    }));
    messages.push(buildMainMenuMessage(true));

    return { messages, effects };
}

function buildRequestLookupResponse() {
    return {
        messages: [
            createMessage({
                text: 'Escribime un tracking o un DNI y lo busco en el portal. Por ejemplo: ENV-001 o 12345678.',
                actions: [
                    createAction('Volver al menu', 'show-main-menu'),
                ],
            }),
        ],
        effects: [
            createEffect('focus-input'),
        ],
    };
}

function buildLookupSubmitResponse(runtime, query) {
    if (normalizeText(runtime.context.query) === normalizeText(query) && runtime.context.searched) {
        if (runtime.context.shipments.length) {
            return {
                messages: [
                    createMessage({
                        text: 'Esa busqueda ya esta cargada en esta misma pagina.',
                        actions: [
                            createAction('Ir a resultados', 'go-results'),
                            createAction('Volver al menu', 'show-main-menu'),
                        ],
                    }),
                ],
                effects: [],
            };
        }

        return {
            messages: [
                createMessage({
                    text: 'Esa busqueda ya se hizo y sigue sin resultados visibles.',
                    actions: [
                        createAction('Buscar otro envio', 'request-lookup'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    return {
        messages: [
            createMessage({
                text: 'Dame un segundo, voy a buscar ' + query + ' en el portal.',
            }),
        ],
        effects: [
            createEffect('submit-lookup', {
                query,
            }),
        ],
    };
}

function buildSelectionPromptResponse(runtime, reason) {
    return {
        messages: [
            createMessage({
                text: 'Encontre varios envios para esta busqueda. Elegi cual queres revisar para ' + reason + ':',
                actions: buildShipmentSelectionActions(runtime.context.shipments),
            }),
        ],
        effects: [],
    };
}

function buildMainMenuResponse() {
    return {
        messages: [buildMainMenuMessage(false)],
        effects: [],
    };
}

function buildFallbackResponse() {
    return {
        messages: [
            createMessage({
                text: 'No llegue a entender esa consulta, pero te puedo ayudar con seguimiento, estados, historial, incidencias, sucursales, comprobantes y soporte.',
                actions: [
                    createAction('Ver menu principal', 'show-main-menu'),
                    createAction('Buscar un envio', 'request-lookup'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildFallbackResponse,
    buildInitResponse,
    buildLookupSubmitResponse,
    buildMainMenuResponse,
    buildRequestLookupResponse,
    buildSelectionPromptResponse,
};
