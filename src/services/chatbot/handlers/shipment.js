const {
    buildHistoryHtml,
    buildIssuesHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');
const { containsAny } = require('../utils');

function buildLocationResponse(shipment) {
    if (!shipment) {
        return {
            messages: [
                createMessage({
                    text: 'Para ubicar un envio puntual necesito un tracking o un DNI. Si ya lo tenes, te puedo decir la ultima sucursal visible, el destino y si tiene ruta activa.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Ver preguntas frecuentes', 'scroll-faq'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const parts = [];

    if (shipment.hasLiveTracking) {
        parts.push('Este envio tiene una ruta activa, asi que el mapa del portal puede mostrar actividad en vivo.');
    } else {
        parts.push('La ubicacion publica depende de los movimientos que se fueron escaneando en el circuito.');
    }

    if (shipment.currentBranchName) {
        parts.push('Ultimo nodo visible: ' + shipment.currentBranchName + '.');
    }

    if (shipment.destinationAddress && shipment.destinationAddress !== '-') {
        parts.push('Destino informado: ' + shipment.destinationAddress + ', ' + shipment.destination + '.');
    } else if (shipment.destination && shipment.destination !== '-') {
        parts.push('Destino informado: ' + shipment.destination + '.');
    }

    if (shipment.lastMovementDateLabel) {
        parts.push('Ultimo movimiento visible: ' + shipment.lastMovementDateLabel + '.');
    }

    parts.push('Si queres, baja al mapa de la tarjeta para ver el recorrido cargado.');

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                actions: [
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Historial', 'show-history'),
                    createAction('Volver al menu', 'show-main-menu'),
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
                    text: 'La fecha estimada depende del envio. Si hay una fecha o una ventana horaria cargada, te la muestro apenas identifiquemos el seguimiento.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Incidencias', 'show-issues'),
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
            ? 'El envio ya figura entregado. La ultima fecha visible es ' + shipment.lastMovementDateLabel + '.'
            : 'El envio ya figura entregado.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text = 'El envio esta cancelado, asi que ya no tiene una fecha estimada activa.';
    } else if (shipment.expectedDeliveryDateLabel && shipment.expectedDeliveryWindow) {
        text = 'La entrega estimada es para ' + shipment.expectedDeliveryDateLabel + ' en la ventana de ' + shipment.expectedDeliveryWindow + '.';
    } else if (shipment.expectedDeliveryDateLabel) {
        text = 'La entrega estimada figura para ' + shipment.expectedDeliveryDateLabel + '.';
    } else if (shipment.statusKey === 'retrasado' || shipment.statusKey === 'intento_fallido' || shipment.statusKey === 'paquete_fallido') {
        text = 'No veo una nueva ETA publica confirmada para este envio. Como hubo una incidencia o una demora, el horario final puede cambiar.';
    } else if (shipment.statusKey === 'en_transito' || shipment.statusKey === 'en_sucursal') {
        text = 'El envio ya esta en operacion, pero este portal todavia no muestra una ETA mas precisa para este caso.';
    } else {
        text = 'Todavia no veo una fecha estimada publica cargada para este envio.';
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Estado actual', 'show-status'),
                    createAction('Incidencias', 'show-issues'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Volver al menu', 'show-main-menu'),
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
                    text: 'Para mostrarte el historial necesito identificar el envio. Si ya tenes tracking o DNI, lo busco y te muestro el paso a paso.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Estado actual', 'show-status'),
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
                    text: 'Todavia no veo movimientos publicos para ' + shipment.trackingId + '.',
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
                text: 'Este es el historial que veo para ' + shipment.trackingId + ':',
                html: buildHistoryHtml(shipment),
                actions: [
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                    createAction('Estado actual', 'show-status'),
                    createAction('Incidencias', 'show-issues'),
                    createAction('Volver al menu', 'show-main-menu'),
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
                    text: 'Estas son las incidencias mas comunes que te puedo explicar desde el portal:',
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
        text = 'Este envio figura con demora. Es probable que la fecha final de entrega se mueva respecto de lo planeado.';
    } else if (shipment.statusKey === 'intento_fallido') {
        text = 'Este envio tuvo un intento de entrega sin exito. Normalmente sigue con reintento, coordinacion o retiro por sucursal.';
    } else if (shipment.statusKey === 'paquete_fallido') {
        text = 'Este envio tiene una incidencia operativa y necesita gestion interna antes de seguir avanzando.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text = 'El envio ya figura cancelado. No deberia seguir moviendose salvo una reapertura interna.';
    } else if (shipment.statusKey === 'entregado') {
        text = 'No veo una incidencia activa. Si tenes un reclamo despues de la entrega, conviene revisarlo con soporte.';
    } else {
        text = 'No veo una incidencia explicita en este momento. El envio viene siguiendo un circuito normal segun el estado actual.';
    }

    if (shipment.lastComment) {
        text += ' Ultimo detalle visible: ' + shipment.lastComment + '.';
    }

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Sucursal o retiro', 'show-branch'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Volver al menu', 'show-main-menu'),
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
                    text: 'La sucursal visible depende del envio y de los escaneos operativos. Si queres, busca un tracking o DNI y te digo la ultima sucursal o nodo registrado.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const parts = [];

    if (shipment.currentBranchName) {
        parts.push('La ultima sucursal o nodo visible es ' + shipment.currentBranchName + '.');
    } else {
        parts.push('Este portal no expone una sucursal actual confirmada para este envio.');
    }

    if (shipment.statusKey === 'en_sucursal') {
        parts.push('Como el estado actual es En Sucursal, esa referencia es la mas util para consulta o posible retiro.');
    } else if (shipment.statusKey === 'intento_fallido') {
        parts.push('Despues de un intento fallido, el retiro por sucursal puede depender de la gestion interna.');
    } else {
        parts.push('La disponibilidad para retiro depende de la operacion y no siempre queda habilitada desde el portal publico.');
    }

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                actions: [
                    createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
                    createAction('Incidencias', 'show-issues'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Volver al menu', 'show-main-menu'),
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
                    text: 'El comprobante de entrega solo aplica a envios ya entregados. Si queres revisar uno puntual, busca el tracking o el DNI y validamos el estado.',
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Hablar con soporte', 'show-support'),
                        createAction('Volver al menu', 'show-main-menu'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    const text = shipment.statusKey === 'entregado'
        ? 'Este envio ya figura entregado. El portal publico no muestra todavia la evidencia completa o firma del POD, asi que ese detalle debe revisarse por soporte o por el panel empresarial.'
        : 'Todavia no te puedo mostrar un comprobante porque el envio no figura como entregado.';

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
                    text: 'Desde el portal publico no hay autogestion para cambiar direccion, contacto, horario, cancelacion o reprogramacion. Esos pedidos hoy van por soporte o por el panel empresarial.',
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

    let text = 'Desde el portal publico no podes autogestionar cambios de este envio.';

    if (containsAny(shipment.statusKey, ['pendiente', 'asignado', 'en_preparacion', 'inicial'])) {
        text += ' Como todavia no esta cerrado, soporte podria revisar si existe margen operativo para cambios.';
    } else if (containsAny(shipment.statusKey, ['en_transito', 'en_sucursal', 'retrasado', 'intento_fallido', 'paquete_fallido'])) {
        text += ' Como ya esta en operacion, los cambios suelen tener mas restricciones y necesitan validacion interna.';
    } else if (shipment.statusKey === 'entregado') {
        text += ' Ya fue entregado, asi que no admite reprogramaciones.';
    } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
        text += ' Ya fue cancelado, asi que no tiene gestion activa.';
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
        ? 'Para ' + shipment.trackingId + ', este portal funciona como un canal de consulta manual. Todavia no hay alta de notificaciones configurables desde esta vista publica.'
        : 'El portal publico todavia no ofrece autogestion de alertas por mail o SMS. Por ahora la consulta es manual desde esta pagina.';

    return {
        messages: [
            createMessage({
                text,
                actions: [
                    createAction('Historial de movimientos', 'show-history'),
                    createAction('Hablar con soporte', 'show-support'),
                    createAction('Volver al menu', 'show-main-menu'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildBranchResponse,
    buildEtaResponse,
    buildHistoryResponse,
    buildIssuesResponse,
    buildLocationResponse,
    buildManagementResponse,
    buildNotificationsResponse,
    buildPodResponse,
};
