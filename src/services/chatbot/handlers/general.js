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

const CLARIFICATION_ACTION_LABELS = {
    'request-lookup': 'Buscar mi envio',
    'show-main-menu': 'Ver menu principal',
    'show-status': 'Estado actual',
    'show-history': 'Historial',
    'show-location': 'Donde esta',
    'show-eta': 'Fecha estimada',
    'show-issues': 'Que paso con mi envio',
    'show-branch': 'Sucursal o retiro',
    'show-pod': 'Comprobante de entrega',
    'show-delivery-issue': 'No reconozco la entrega',
    'show-management': 'Cambios o gestiones',
    'show-support': 'Hablar con soporte',
};

function buildTrackedText(shipment, text) {
    if (!shipment) {
        return text;
    }

    return text.replace('{trackingId}', shipment.trackingId);
}

function buildClarificationActions(actions) {
    const unique = Array.from(new Set(actions.filter(Boolean)));
    return unique.map((action) => createAction(
        CLARIFICATION_ACTION_LABELS[action] || 'Seguir por esta opcion',
        action
    ));
}

function buildUnderstandMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);
    const stage = getShipmentStage(shipment?.statusKey);

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

    if (stage === 'entregado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} como referencia, te puedo explicar la entrega, mostrar el historial visible o ayudarte si no la reconoces.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
                        createAction('Comprobante de entrega', 'show-pod'),
                        createAction('No reconozco la entrega', 'show-delivery-issue'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'cancelado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} como referencia, te puedo explicar por que ya no sigue en curso y mostrarte el historial visible.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
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
    const stage = getShipmentStage(shipment?.statusKey);

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

    if (stage === 'entregado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} ya figura entregado. Si queres, te muestro la ultima referencia visible, el historial o el comprobante.'),
                    actions: [
                        createAction('Historial', 'show-history'),
                        createAction('Comprobante de entrega', 'show-pod'),
                        createAction('No reconozco la entrega', 'show-delivery-issue'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'cancelado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} esta cancelado, asi que ya no sigue avanzando. Si queres, te muestro el estado final o el historial visible.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'en_sucursal') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} te puedo mostrar la ultima referencia visible, el historial y lo que aparece sobre sucursal o retiro.'),
                    actions: [
                        createAction('Sucursal o retiro', 'show-branch'),
                        createAction('Donde esta', 'show-location'),
                        createAction('Historial', 'show-history'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'aun_no_salio') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} todavia no salio a recorrido. Si queres, te muestro el estado actual, la fecha estimada o que significa esta etapa.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Fecha estimada', 'show-eta'),
                        createAction('Que significa este estado', 'show-status-guide', shipment.statusKey),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'con_problema') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} te puedo mostrar la ultima referencia visible y revisar si la demora o el problema cambio la fecha estimada.'),
                    actions: [
                        createAction('Donde esta', 'show-location'),
                        createAction('Que paso con mi envio', 'show-issues'),
                        createAction('Fecha estimada', 'show-eta'),
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
                text: buildTrackedText(shipment, 'Si queres revisar {trackingId}, te puedo mostrar donde esta, cual es la ultima referencia visible y cuando podria llegar.'),
                actions: [
                    createAction('Donde esta', 'show-location'),
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Historial', 'show-history'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildProblemMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);
    const stage = getShipmentStage(shipment?.statusKey);

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

    if (stage === 'entregado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Si el problema con {trackingId} es la entrega, te puedo ayudar con el comprobante o con el caso de entrega no reconocida.'),
                    actions: [
                        createAction('No reconozco la entrega', 'show-delivery-issue'),
                        createAction('Comprobante de entrega', 'show-pod'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'cancelado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} ya esta cancelado. Si queres, te muestro el historial visible o te paso a soporte para revisar el caso.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'en_sucursal') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Si hubo un problema con {trackingId}, te conviene revisar la sucursal visible, el historial y la ayuda de soporte.'),
                    actions: [
                        createAction('Sucursal o retiro', 'show-branch'),
                        createAction('Historial', 'show-history'),
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
                text: stage === 'con_problema'
                    ? buildTrackedText(shipment, 'Con {trackingId} te puedo mostrar que paso, si hay una nueva fecha estimada y cuando conviene hablar con soporte.')
                    : buildTrackedText(shipment, 'Si hubo un problema con {trackingId}, revisemos que paso y que opciones tenes ahora.'),
                actions: [
                    createAction('Que paso con mi envio', 'show-issues'),
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Sucursal o retiro', 'show-branch'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildDeliveryMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);
    const stage = getShipmentStage(shipment?.statusKey);

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

    if (stage === 'entregado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} te puedo ayudar a revisar la entrega, el comprobante o un reclamo si no la reconoces.'),
                    actions: [
                        createAction('Comprobante de entrega', 'show-pod'),
                        createAction('No reconozco la entrega', 'show-delivery-issue'),
                        createAction('Historial', 'show-history'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'en_sucursal') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} te puedo mostrar la sucursal visible, la ultima referencia y el historial para que revises el retiro.'),
                    actions: [
                        createAction('Sucursal o retiro', 'show-branch'),
                        createAction('Donde esta', 'show-location'),
                        createAction('Historial', 'show-history'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'cancelado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} esta cancelado, asi que ya no tiene una entrega o retiro activo. Si queres, te muestro el estado final o te paso con soporte.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
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
                text: buildTrackedText(shipment, 'Con {trackingId} te puedo ayudar a revisar entrega, retiro o comprobante segun el estado actual.'),
                actions: [
                    createAction('Sucursal o retiro', 'show-branch'),
                    createAction('Comprobante de entrega', 'show-pod'),
                    createAction('Historial', 'show-history'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildManagementMenuResponse(runtime) {
    const shipment = getSelectedShipment(runtime);
    const stage = getShipmentStage(shipment?.statusKey);

    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Aca te ayudo con cambios, alertas y soporte. Si queres revisar una gestion puntual, primero pasame el tracking o el DNI.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Acceso empresas', 'go-login'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'entregado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} ya fue entregado, asi que no admite cambios. Si el problema es la entrega, te conviene revisar ese caso con soporte.'),
                    actions: [
                        createAction('No reconozco la entrega', 'show-delivery-issue'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Historial', 'show-history'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'cancelado') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, '{trackingId} ya esta cancelado, asi que no tiene una gestion activa desde el portal. Si queres mas contexto, soporte puede revisarlo.'),
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Acceso empresas', 'go-login'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (stage === 'con_problema') {
        return {
            messages: [
                createMessage({
                    text: buildTrackedText(shipment, 'Con {trackingId} te puedo orientar sobre cambios, restricciones y como escalar el caso mientras se revisa el problema visible.'),
                    actions: [
                        createAction('Cambios o gestiones', 'show-management'),
                        createAction('Que paso con mi envio', 'show-issues'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Acceso empresas', 'go-login'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    return {
        messages: [
            createMessage({
                text: stage === 'aun_no_salio'
                    ? buildTrackedText(shipment, 'Con {trackingId} te puedo orientar sobre cambios posibles, alertas y como escalar el caso si hace falta.')
                    : buildTrackedText(shipment, 'Con {trackingId} te puedo orientar sobre cambios, restricciones y soporte segun el estado actual.'),
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
                createAction('Ver preguntas frecuentes', 'scroll-faq'),
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
                createAction('Buscar mi envio', 'request-lookup'),
                createAction('Hablar con soporte', 'show-support'),
            ],
        }));
        messages.push(buildMainMenuMessage(true));
        return { messages, effects };
    }

    messages.push(createMessage({
        text: 'Para arrancar, pasame un numero de seguimiento como ENV-001 o el DNI del destinatario.',
        actions: [
            createAction('Buscar mi envio', 'request-lookup'),
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
                text: 'Pasame el tracking o el DNI que queres buscar y lo reviso. Por ejemplo: ENV-001 o 12345678.',
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

function buildAcknowledgementResponse(runtime) {
    const shipment = getSelectedShipment(runtime);

    if (shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Perfecto. Si queres, sigo con ' + shipment.trackingId + ' o buscamos otro envio.',
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Buscar otro envio', 'request-lookup'),
                        createAction('Ver menu principal', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    return {
        messages: [
            createMessage({
                text: 'Perfecto. Cuando quieras, te ayudo con otro envio o con una consulta del portal.',
                actions: [
                    createAction('Buscar mi envio', 'request-lookup'),
                    createAction('Ver menu principal', 'show-main-menu'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildClarificationResponse(actions) {
    const clarificationActions = buildClarificationActions(actions);

    return {
        messages: [
            createMessage({
                text: 'Te entendi a medias. Decime por cual de estas opciones queres seguir y te llevo directo.',
                actions: clarificationActions.length
                    ? clarificationActions
                    : [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Ver menu principal', 'show-main-menu'),
                    ],
            }),
        ],
        effects: [],
    };
}

function buildFallbackResponse(shipment) {
    if (shipment) {
        return {
            messages: [
                createMessage({
                    text: 'No termine de ubicar esa consulta sobre ' + shipment.trackingId + '. Si queres, te muestro el estado, el historial o te paso con soporte.',
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Historial', 'show-history'),
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
                text: 'No termine de entenderte. Si queres, te ayudo con seguimiento, historial, demoras, sucursales o soporte.',
                actions: [
                    createAction('Ver menu principal', 'show-main-menu'),
                    createAction('Buscar mi envio', 'request-lookup'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildAcknowledgementResponse,
    buildClarificationResponse,
    buildDeliveryMenuResponse,
    buildFallbackResponse,
    buildInitResponse,
    buildLocationMenuResponse,
    buildLookupSubmitResponse,
    buildMainMenuResponse,
    buildManagementMenuResponse,
    buildProblemMenuResponse,
    buildRequestLookupResponse,
    buildSelectionPromptResponse,
    buildUnderstandMenuResponse,
};
