const {
    buildShipmentSummary,
    buildStatusGuideHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');
const { getStatusCopy } = require('../utils');

function buildStatusResponse(shipment) {
    if (!shipment) {
        return buildStatusGuideResponse();
    }

    const copy = getStatusCopy(shipment.statusKey);
    const parts = [
        shipment.trackingId + ' ahora figura como ' + copy.label + '.',
        copy.summary,
    ];

    if (shipment.lastMovementDateLabel) {
        parts.push('Ultima actualizacion que veo: ' + shipment.lastMovementDateLabel + '.');
    }

    if (shipment.lastComment) {
        parts.push('Ultimo detalle informado: ' + shipment.lastComment + '.');
    }

    if (copy.next) {
        parts.push(copy.next);
    }

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                html: buildShipmentSummary(shipment),
                actions: [
                    createAction('Ubicacion y recorrido', 'show-location'),
                    createAction('Fecha estimada', 'show-eta'),
                    createAction('Historial', 'show-history'),
                    createAction('Incidencias', 'show-issues'),
                ],
            }),
        ],
        effects: [],
    };
}

function buildStatusGuideResponse(statusKey) {
    if (statusKey) {
        const copy = getStatusCopy(statusKey);
        return {
            messages: [
                createMessage({
                    text: copy.label + ': ' + copy.summary + (copy.next ? ' ' + copy.next : ''),
                    actions: [
                        createAction('Buscar un envio', 'request-lookup'),
                        createAction('Ver todos los estados', 'show-status-guide'),
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
                text: 'Aca tenes una referencia rapida de los estados del portal:',
                html: buildStatusGuideHtml(),
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

module.exports = {
    buildStatusGuideResponse,
    buildStatusResponse,
};
