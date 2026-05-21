const { MAIN_MENU_ACTIONS, ORDERED_STATUS_KEYS } = require('./constants');
const { escapeHtml, getStatusCopy } = require('./utils');

function createAction(label, action, value) {
    const nextAction = {
        label,
        action,
    };

    if (value !== null && value !== undefined && value !== '') {
        nextAction.value = String(value);
    }

    return nextAction;
}

function createMessage({ text = '', html = '', actions = [] }) {
    const message = {
        role: 'bot',
        text,
    };

    if (html) {
        message.html = html;
    }

    if (actions.length) {
        message.actions = actions.map((action) => ({ ...action }));
    }

    return message;
}

function createEffect(type, payload = {}) {
    return {
        type,
        ...payload,
    };
}

function buildMainMenuMessage(isInitial) {
    return createMessage({
        text: isInitial
            ? 'Estas son las consultas principales que ya cubre el asistente:'
            : 'Estas son las opciones principales del asistente:',
        actions: MAIN_MENU_ACTIONS.map((item) => createAction(item.label, item.action, item.value)),
    });
}

function buildShipmentSelectionActions(shipments) {
    return shipments.map((shipment) => createAction(
        shipment.trackingId + ' - ' + shipment.status,
        'focus-shipment',
        shipment.id
    ));
}

function buildShipmentContextActions(shipment) {
    return [
        createAction('Estado actual', 'show-status'),
        createAction('Ubicacion y recorrido', 'show-location'),
        createAction('Fecha estimada', 'show-eta'),
        createAction('Historial', 'show-history'),
        createAction('Ver tarjeta del envio', 'focus-shipment', shipment.id),
    ];
}

function buildShipmentSummary(shipment) {
    const lines = [
        '<div class="portal-chatbot-summary">',
        '<div class="portal-chatbot-summary-top">',
        '<strong>' + escapeHtml(shipment.trackingId || '-') + '</strong>',
        '<span class="portal-chatbot-status portal-chatbot-status--' + escapeHtml(shipment.statusKey || 'default') + '">' + escapeHtml(shipment.status || '-') + '</span>',
        '</div>',
        '<p><strong>Destinatario:</strong> ' + escapeHtml(shipment.recipient || '-') + '</p>',
        '<p><strong>Destino:</strong> ' + escapeHtml(shipment.destinationAddress && shipment.destinationAddress !== '-' ? shipment.destinationAddress + ', ' + shipment.destination : shipment.destination || '-') + '</p>',
    ];

    if (shipment.currentBranchName) {
        lines.push('<p><strong>Ultimo nodo:</strong> ' + escapeHtml(shipment.currentBranchName) + '</p>');
    }

    if (shipment.expectedDeliveryDateLabel) {
        lines.push('<p><strong>ETA:</strong> ' + escapeHtml(shipment.expectedDeliveryDateLabel + (shipment.expectedDeliveryWindow ? ' - ' + shipment.expectedDeliveryWindow : '')) + '</p>');
    }

    lines.push('</div>');
    return lines.join('');
}

function buildStatusGuideHtml() {
    return [
        '<ul class="portal-chatbot-rich-list">',
        ORDERED_STATUS_KEYS.map((key) => {
            const copy = getStatusCopy(key);
            return '<li><strong>' + escapeHtml(copy.label) + ':</strong> ' + escapeHtml(copy.summary) + '</li>';
        }).join(''),
        '</ul>',
    ].join('');
}

function buildHistoryHtml(shipment) {
    return [
        '<ol class="portal-chatbot-history-list">',
        shipment.history.map((item) => {
            const meta = [];

            if (item.branchName) {
                meta.push('Sucursal: ' + item.branchName);
            }

            if (item.comment) {
                meta.push(item.comment);
            }

            return [
                '<li>',
                '<strong>' + escapeHtml(item.changedAtLabel || '-') + '</strong>',
                '<span>' + escapeHtml(item.toStatus || '-') + '</span>',
                meta.length ? '<p>' + escapeHtml(meta.join(' | ')) + '</p>' : '',
                '</li>',
            ].join('');
        }).join(''),
        '</ol>',
    ].join('');
}

function buildIssuesHtml() {
    return [
        '<ul class="portal-chatbot-rich-list">',
        '<li><strong>Intento fallido:</strong> hubo una visita de entrega que no se pudo cerrar.</li>',
        '<li><strong>Paquete fallido:</strong> hay una incidencia operativa que requiere revision.</li>',
        '<li><strong>Retrasado:</strong> existe una demora respecto del circuito esperado.</li>',
        '</ul>',
    ].join('');
}

function buildSupportHtml(support) {
    return [
        '<div class="portal-chatbot-support-card">',
        '<strong>Canales de soporte</strong>',
        '<p>Email: <a href="mailto:' + escapeHtml(support.email) + '">' + escapeHtml(support.email) + '</a></p>',
        '<p>Horario: ' + escapeHtml(support.hours) + '</p>',
        '</div>',
    ].join('');
}

module.exports = {
    buildHistoryHtml,
    buildIssuesHtml,
    buildMainMenuMessage,
    buildShipmentContextActions,
    buildShipmentSelectionActions,
    buildShipmentSummary,
    buildStatusGuideHtml,
    buildSupportHtml,
    createAction,
    createEffect,
    createMessage,
};
