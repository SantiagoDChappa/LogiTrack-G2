const {
    buildShipmentSummary,
    buildStatusGuideHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');
const { getStatusCopy, normalizeText } = require('../utils');

function pushUnique(parts, text) {
    const value = String(text || '').trim();
    if (!value) { return; }

    const normalized = normalizeText(value).replace(/\.+$/, '');
    if (!normalized) { return; }

    const exists = parts.some((part) => normalizeText(part).replace(/\.+$/, '') === normalized);
    if (!exists) {
        parts.push(value);
    }
}

function buildStatusHeadline(shipment, copy) {
    switch (shipment.statusKey) {
    case 'entregado':
        return shipment.trackingId + ' ya fue entregado.';
    case 'cancelado':
    case 'cancelada':
        return shipment.trackingId + ' esta cancelado.';
    case 'retrasado':
        return shipment.trackingId + ' viene con demora.';
    case 'intento_fallido':
        return 'No se pudo completar la entrega de ' + shipment.trackingId + '.';
    case 'paquete_fallido':
        return 'Hay un problema con ' + shipment.trackingId + '.';
    case 'en_transito':
        return shipment.trackingId + ' esta en camino.';
    case 'en_sucursal':
        return shipment.trackingId + ' esta en sucursal.';
    case 'en_preparacion':
        return shipment.trackingId + ' se esta preparando.';
    case 'asignado':
        return shipment.trackingId + ' ya fue asignado.';
    case 'pendiente':
    case 'inicial':
        return shipment.trackingId + ' ya fue registrado.';
    default:
        return shipment.trackingId + ' esta en ' + copy.label.toLowerCase() + '.';
    }
}

function buildStatusActions(shipment) {
    if (shipment.statusKey === 'entregado') {
        return [
            createAction('Historial', 'show-history'),
            createAction('Comprobante de entrega', 'show-pod'),
            createAction('No reconozco la entrega', 'show-delivery-issue'),
        ];
    }

    if (shipment.statusKey === 'en_sucursal') {
        return [
            createAction('Sucursal o retiro', 'show-branch'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    if (['retrasado', 'intento_fallido', 'paquete_fallido'].includes(shipment.statusKey)) {
        return [
            createAction('Que paso con mi envio', 'show-issues'),
            createAction('Fecha estimada', 'show-eta'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    return [
        createAction('Donde esta', 'show-location'),
        createAction('Fecha estimada', 'show-eta'),
        createAction('Historial', 'show-history'),
    ];
}

function buildStatusResponse(shipment) {
    if (!shipment) {
        return buildStatusGuideResponse();
    }

    const copy = getStatusCopy(shipment.statusKey);
    const parts = [];

    pushUnique(parts, buildStatusHeadline(shipment, copy));

    if (shipment.lastMovementDateLabel) {
        pushUnique(parts, 'Ultima actualizacion visible: ' + shipment.lastMovementDateLabel + '.');
    }

    if (copy.next) {
        pushUnique(parts, copy.next);
    }

    return {
        messages: [
            createMessage({
                text: parts.join(' '),
                html: buildShipmentSummary(shipment),
                actions: buildStatusActions(shipment),
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
                        createAction('Buscar mi envio', 'request-lookup'),
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
                text: 'Aca tenes una guia simple de los estados del portal:',
                html: buildStatusGuideHtml(),
                actions: [
                    createAction('Buscar mi envio', 'request-lookup'),
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
