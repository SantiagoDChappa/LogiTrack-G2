const {
    buildHistoryHtml,
    buildIssuesHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');
const { containsAny, normalizeText } = require('../utils');

function appendUniqueSentence(base, sentence) {
    const prefix = String(base || '').trim();
    const value = String(sentence || '').trim();

    if (!value) {
        return prefix;
    }

    const normalizedPrefix = normalizeText(prefix);
    const normalizedValue = normalizeText(value);

    if (normalizedPrefix && normalizedPrefix.includes(normalizedValue)) {
        return prefix;
    }

    return [prefix, value].filter(Boolean).join(' ');
}

function buildLocationResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si me pasas un tracking o un DNI, te digo la ultima referencia visible y te muestro el recorrido general.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const parts = [];

    parts.push('Te muestro la ubicacion segun los movimientos que fueron quedando registrados.');

    if (shipment.currentBranchName) {
        parts.push('Ultima referencia: ' + shipment.currentBranchName + '.');
    } else if (shipment.destination && shipment.destination !== '-') {
        parts.push('Zona de destino: ' + shipment.destination + '.');
    }

    if (shipment.lastMovementDateLabel) {
        parts.push('Ultimo movimiento: ' + shipment.lastMovementDateLabel + '.');
    }

    parts.push('Si queres, baja al mapa de la tarjeta para ver el recorrido general.');

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                actions: [
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Historial', 'show-history'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildEtaResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si me pasas un tracking o un DNI, te digo si ya hay una fecha estimada cargada.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    let text = '';

    if (shipment.statusKey === 'entregado') {
        text = shipment.lastMovementDateLabel
            ? 'Este envio ya fue entregado. La ultima actualizacion visible es ' + shipment.lastMovementDateLabel + '.'
            : 'Este envio ya fue entregado.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text = 'Este envio esta cancelado, asi que ya no tiene una fecha estimada activa.';
    } else if (shipment.expectedDeliveryDateLabel && shipment.expectedDeliveryWindow) {
        text = 'Por ahora, la entrega esta prevista para ' + shipment.expectedDeliveryDateLabel + ' entre ' + shipment.expectedDeliveryWindow + '.';
    } else if (shipment.expectedDeliveryDateLabel) {
        text = 'Por ahora, la fecha estimada es ' + shipment.expectedDeliveryDateLabel + '.';
    } else if (shipment.statusKey === 'retrasado' || shipment.statusKey === 'intento_fallido' || shipment.statusKey === 'paquete_fallido') {
        text = 'Por ahora no aparece una nueva fecha estimada. Como hubo una demora o un problema con el envio, puede actualizarse mas adelante.';
    } else if (shipment.statusKey === 'en_transito' || shipment.statusKey === 'en_sucursal') {
        text = 'El envio ya esta en camino, pero por ahora no aparece una fecha mas precisa.';
    } else {
        text = 'Por ahora no veo una fecha estimada publica para este envio.';
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Estado actual', 'show-status'),
                    createAction('Incidencias', 'show-issues'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildHistoryResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si me pasas un tracking o un DNI, te muestro el historial del envio paso a paso.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (!Array.isArray(shipment.history) || shipment.history.length === 0) {
        return {
            messages: [
                createMessage({
                    text: 'Por ahora no veo movimientos publicos para ' + shipment.trackingId + '.',
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Fecha estimada', 'show-eta'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    return {
        messages: [
            createMessage({
                text: 'Este es el historial visible de ' + shipment.trackingId + '.',
                html: buildHistoryHtml(shipment),
                actions: [
                    createAction('Estado actual', 'show-status'),
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                    createAction('Incidencias', 'show-issues'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildIssuesResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Estas son las situaciones mas comunes que te puedo explicar desde el portal:',
                    html: buildIssuesHtml(),
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Significado de los estados', 'show-status-guide'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    let text = '';

    if (shipment.statusKey === 'retrasado') {
        text = 'Este envio viene con demora. La fecha de entrega puede correrse respecto de lo previsto.';
    } else if (shipment.statusKey === 'intento_fallido') {
        text = 'No se pudo completar la entrega en la ultima visita. Puede resolverse con un nuevo intento o con retiro por sucursal.';
    } else if (shipment.statusKey === 'paquete_fallido') {
        text = 'Hubo un problema con el envio y el equipo tiene que revisarlo antes de que siga avanzando.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text = 'Este envio esta cancelado, asi que ya no deberia seguir moviendose.';
    } else if (shipment.statusKey === 'entregado') {
        text = 'No veo un problema activo con este envio. Si no reconoces la entrega, te conviene hablar con soporte.';
    } else {
        text = 'Por ahora no veo un problema visible en este envio.';
    }

    if (shipment.lastComment) {
        text = appendUniqueSentence(text, 'Ultima novedad visible: ' + shipment.lastComment + '.');
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    ...(shipment.statusKey === 'entregado'
                        ? [createAction('No reconozco la entrega', 'show-delivery-issue')]
                        : [createAction('Fecha estimada', 'show-eta')]),
                    createAction('Sucursal o retiro', 'show-branch'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildDeliveryIssueResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si el problema es con una entrega puntual, primero pasame el tracking o el DNI para revisar ese envio.',
                    actions: [
                        createAction('Buscar mi envio', 'request-lookup'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    if (shipment.statusKey !== 'entregado') {
        return {
            messages: [
                createMessage({
                    text: shipment.trackingId + ' todavia no figura como entregado. Si queres, puedo mostrarte el estado actual o revisar si hubo un problema en el recorrido.',
                    actions: [
                        createAction('Estado actual', 'show-status'),
                        createAction('Que paso con mi envio', 'show-issues'),
                        createAction('Hablar con soporte', 'show-support'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const parts = [
        shipment.trackingId + ' ya figura entregado.',
    ];

    if (shipment.lastMovementDateLabel) {
        parts.push('La ultima actualizacion visible es ' + shipment.lastMovementDateLabel + '.');
    }

    parts.push('Si no reconoces la entrega, lo mejor es revisar este caso con soporte cuanto antes.');

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                actions: [
                    createAction('Comprobante de entrega', 'show-pod'),
                    createAction('Historial', 'show-history'),
                    createAction('Hablar con soporte', 'show-support'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildBranchResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Si me pasas un tracking o un DNI, te digo cual es la ultima referencia visible del envio.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const parts = [];

    if (shipment.currentBranchName) {
        parts.push('La ultima referencia visible es ' + shipment.currentBranchName + '.');
    } else {
        parts.push('Por ahora no aparece una sucursal visible para este envio.');
    }

    if (shipment.statusKey === 'en_sucursal') {
        parts.push('Como ahora esta en sucursal, esa referencia es la mejor para consultar un posible retiro.');
    } else if (shipment.statusKey === 'intento_fallido') {
        parts.push('Si queres retirarlo, te conviene revisar esta referencia con soporte.');
    } else {
        parts.push('Si necesitas confirmar retiro, soporte puede orientarte segun el estado actual.');
    }

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                actions: [
                    createAction('Incidencias', 'show-issues'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                ],
            }),
        ],
        effects: [],
    };
}

function buildPodResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'El comprobante de entrega solo aplica a envios que ya fueron entregados. Si queres revisar uno puntual, pasame el tracking o el DNI.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const text = shipment.statusKey === 'entregado'
        ? 'Este envio ya fue entregado. Desde este portal no se ve el comprobante completo, asi que si lo necesitas te conviene pedirlo a soporte.'
        : 'Todavia no puedo mostrar un comprobante porque el envio aun no figura como entregado.';

    return {
        messages: [
            createMessage({
                text,
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

function buildManagementResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Desde este portal no podes cambiar direccion, horario o contacto. Si necesitas hacerlo, tenes que verlo con soporte o desde el acceso empresas.',
                    actions: [
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Acceso empresas', 'go-login'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    let text = 'Desde este portal no podes hacer cambios sobre este envio.';

    if (containsAny(shipment.statusKey, ['pendiente', 'asignado', 'en_preparacion', 'inicial'])) {
        text += ' Como todavia no esta cerrado, soporte puede revisar si todavia hay margen para ayudarte.';
    } else if (containsAny(shipment.statusKey, ['en_transito', 'en_sucursal', 'retrasado', 'intento_fallido', 'paquete_fallido'])) {
        text += ' Como ya esta en camino o en revision, los cambios suelen tener mas restricciones.';
    } else if (shipment.statusKey === 'entregado') {
        text += ' Como ya fue entregado, no admite reprogramaciones.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text += ' Como ya fue cancelado, no tiene una gestion activa.';
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Acceso empresas', 'go-login'),
                    createAction('Estado actual', 'show-status'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildNotificationsResponse(shipment) {
    const text = shipment
        ? 'Por ahora no podes activar alertas para ' + shipment.trackingId + ' desde esta vista. La consulta sigue siendo manual desde esta pagina.'
        : 'Por ahora este portal no permite activar alertas por mail o SMS. La consulta sigue siendo manual desde esta pagina.';

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Historial de movimientos', 'show-history'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Estado actual', 'show-status'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildBranchResponse,
    buildDeliveryIssueResponse,
    buildEtaResponse,
    buildHistoryResponse,
    buildIssuesResponse,
    buildLocationResponse,
    buildManagementResponse,
    buildNotificationsResponse,
    buildPodResponse,
};
