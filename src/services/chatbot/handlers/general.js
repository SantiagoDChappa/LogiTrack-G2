const {
    buildMainMenuMessage,
    buildShipmentContextActions,
    buildShipmentSelectionHtml,
    buildShipmentSelectionActions,
    buildShipmentSummary,
    createAction,
    createEffect,
    createMessage,
} = require('../responseBuilder');
const { getSelectedShipment } = require('../runtime');
const { getShipmentStage, normalizeText } = require('../utils');

function buildTrackedText(shipment, text) {
    if (!shipment) {
        return text;
    }

    return text.replace('{trackingId}', shipment.trackingId);
}

function buildUnderstandMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si queres entender un envio puntual, primero pasame el tracking o el DNI. Si no, tambien te puedo explicar que significa cada estado.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Ver guia de estados', 'show-status-guide'),
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
                text: buildTrackedText(shipment, 'Con {trackingId} como referencia, te puedo ayudar a entender que esta pasando y que deberia pasar despues.'),
                actions: [
                    createAction('Estado actual', 'show-status'),
                    createAction('Que significa este estado', 'show-status-guide', shipment.statusKey),
                    createAction('Historial', 'show-history'),
                    createAction('Fecha estimada', 'show-eta'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildLocationMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si me pasas un tracking o un DNI, te digo donde esta el envio, cual es la ultima referencia visible y si ya hay una fecha estimada.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const stage = getShipmentStage(shipment.statusKey);
    const actions = [
        createAction('Donde esta', 'show-location'),
        createAction('Fecha estimada', 'show-eta'),
        createAction('Historial', 'show-history'),
    ];

    if (stage === 'en_sucursal') {
        actions[2] = createAction('Sucursal o retiro', 'show-branch');
    }

    return {
        messages: [
            createMessage({
                text: buildTrackedText(shipment, 'Si queres revisar {trackingId}, te puedo mostrar donde esta, cual es la ultima referencia visible y cuando podria llegar.'),
                actions,
            }),
        ],
        effects: [],
    };
}

function buildProblemMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si hubo un problema con tu envio, primero pasame el tracking o el DNI. Despues te ayudo a revisar demoras, intentos fallidos o un reclamo.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Problemas comunes', 'show-issues'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const stage = getShipmentStage(shipment.statusKey);
    const text = stage === 'entregado'
        ? buildTrackedText(shipment, 'Si el problema con {trackingId} es que figura entregado pero no lo tenes, te ayudo a revisar ese caso.')
        : buildTrackedText(shipment, 'Si hubo un problema con {trackingId}, revisemos que paso y que opciones tenes ahora.');
    const actions = stage === 'entregado'
        ? [
            createAction('No reconozco la entrega', 'show-delivery-issue'),
            createAction('Comprobante de entrega', 'show-pod'),
            createAction('Hablar con soporte', 'show-support'),
        ]
        : [
            createAction('Que paso con mi envio', 'show-issues'),
            createAction('Fecha estimada', 'show-eta'),
            createAction('Sucursal o retiro', 'show-branch'),
            createAction('Hablar con soporte', 'show-support'),
        ];

    return {
        messages: [
            createMessage({
                text,
                actions,
            }),
        ],
        effects: [],
    };
}

function buildDeliveryMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Aca te puedo ayudar con retiro, entrega y comprobante. Si queres revisar un envio puntual, pasame el tracking o el DNI.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Comprobante de entrega', 'show-pod'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const stage = getShipmentStage(shipment.statusKey);
    let text = buildTrackedText(shipment, 'Con {trackingId} te puedo ayudar a revisar entrega, retiro o comprobante.');
    let actions = [
        createAction('Sucursal o retiro', 'show-branch'),
        createAction('Comprobante de entrega', 'show-pod'),
        createAction('Historial', 'show-history'),
        createAction('Hablar con soporte', 'show-support'),
    ];

    if (stage === 'entregado') {
        text = buildTrackedText(shipment, 'Con {trackingId} te puedo ayudar a revisar la entrega, el comprobante o un reclamo si no reconoces la entrega.');
        actions = [
            createAction('Comprobante de entrega', 'show-pod'),
            createAction('No reconozco la entrega', 'show-delivery-issue'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    } else if (stage === 'en_sucursal') {
        text = buildTrackedText(shipment, 'Con {trackingId} te puedo ayudar a revisar la referencia visible y si conviene consultar retiro.');
        actions = [
            createAction('Sucursal o retiro', 'show-branch'),
            createAction('Donde esta', 'show-location'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    return {
        messages: [
            createMessage({
                text,
                actions,
            }),
        ],
        effects: [],
    };
}

function buildManagementMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);
    const stage = getShipmentStage(shipment?.statusKey);
    let text = 'Aca te ayudo con cambios, alertas y soporte.';

    if (shipment && stage === 'aun_no_salio') {
        text = buildTrackedText(shipment, 'Con {trackingId} te puedo orientar sobre cambios posibles, alertas y como escalar el caso si hace falta.');
    } else if (shipment && stage !== 'default') {
        text = buildTrackedText(shipment, 'Con {trackingId} te puedo orientar sobre cambios, restricciones y soporte segun el estado actual.');
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Cambios o gestiones', 'show-management'),
                    createAction('Notificaciones', 'show-notifications'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Acceso empresas', 'go-login'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildInitResponse(runtime) {
    const messages = [
        createMessage({
            text: 'Hola. Te ayudo a seguir tu envio y entender que esta pasando.',
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
            text: runtime.context.error + ' Si queres, probamos otra busqueda o vemos otras opciones.',
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
            text: 'Ya tengo este envio como referencia.',
            html: buildShipmentSummary(shipment),
            actions: buildShipmentContextActions(shipment),
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    if (runtime.context.shipments.length > 1) {
        messages.push(createMessage({
            text: 'Encontre varios envios para esta busqueda. Elegi cual queres revisar.',
            html: runtime.context.searchType === 'dni'
                ? buildShipmentSelectionHtml(runtime.context.shipments)
                : '',
            actions: buildShipmentSelectionActions(runtime.context.shipments),
        }));
        return { messages, effects };
    }

    if (runtime.context.searched && runtime.context.shipments.length === 0) {
        messages.push(createMessage({
            text: 'No encontre resultados para esa busqueda. Si queres, proba con otro tracking, busca por DNI o anda a soporte.',
            actions: [
                createAction('Buscar un envio', 'request-lookup'),
                createAction('Hablar con soporte', 'show-support'),
            ],
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    messages.push(createMessage({
        text: 'Para arrancar, pasame un numero de seguimiento como ENV-001 o el DNI del destinatario.',
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
                text: 'Pasame un tracking o un DNI y lo busco. Por ejemplo: ENV-001 o 12345678.',
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
                        text: 'Esa busqueda ya esta cargada en la pagina.',
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
                    text: 'Esa busqueda ya se hizo y sigue sin resultados.',
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
                text: 'Dame un segundo, estoy buscando ' + query + '.',
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
                text: 'Encontre varios envios para esta busqueda. Elegi cual queres revisar para ' + reason + '.',
                html: runtime.context.searchType === 'dni'
                    ? buildShipmentSelectionHtml(runtime.context.shipments)
                    : '',
                actions: buildShipmentSelectionActions(runtime.context.shipments),
            }),
        ],
        effects: [],
    };
}

function buildMainMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    return {
        messages: shipment
            ? [
                createMessage({
                    text: 'Sigo tomando ' + shipment.trackingId + ' como referencia. Si queres, tambien podes elegir una de estas opciones generales:',
                }),
                buildMainMenuMessage(false),
            ]
            : [buildMainMenuMessage(false)],
        effects: [],
    };
}

function buildFallbackResponse() {
    return {
        messages: [
            createMessage({
                text: 'No termine de entenderte. Si queres, te ayudo con seguimiento, historial, demoras, sucursales o soporte.',
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
    buildDeliveryMenuResponse,
    buildLocationMenuResponse,
    buildLookupSubmitResponse,
    buildMainMenuResponse,
    buildManagementMenuResponse,
    buildProblemMenuResponse,
    buildRequestLookupResponse,
    buildSelectionPromptResponse,
    buildUnderstandMenuResponse,
};
