const { MAIN_MENU_ACTIONS, ORDERED_STATUS_KEYS } = require('./constants');
const { escapeHtml, getShipmentStage, getStatusCopy } = require('./utils');

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
            ? 'Estas son las formas principales en las que te puedo ayudar:'
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

function buildShipmentSelectionHtml(shipments) {
    return [
        '<ul class="portal-chatbot-rich-list">',
        shipments.map((shipment) => {
            const parts = [
                '<strong>' + escapeHtml(shipment.trackingId || '-') + '</strong>',
                escapeHtml(shipment.status || '-'),
            ];

            if (shipment.createdAtLabel && shipment.createdAtLabel !== '-') {
                parts.push('Fecha: ' + escapeHtml(shipment.createdAtLabel));
            }

            if (shipment.destination && shipment.destination !== '-') {
                parts.push('Destino: ' + escapeHtml(shipment.destination));
            }

            return '<li>' + parts.join(' | ') + '</li>';
        }).join(''),
        '</ul>',
    ].join('');
}

function buildShipmentContextActions(shipment) {
    const stage = getShipmentStage(shipment?.statusKey);

    if (stage === 'aun_no_salio') {
        return [
            createAction('Estado actual', 'show-status'),
            createAction('Fecha estimada', 'show-eta'),
            createAction('Que significa este estado', 'show-status-guide', shipment.statusKey),
            createAction('Cambios o gestiones', 'show-management'),
        ];
    }

    if (stage === 'en_camino') {
        return [
            createAction('Donde esta', 'show-location'),
            createAction('Fecha estimada', 'show-eta'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    if (stage === 'en_sucursal') {
        return [
            createAction('Sucursal o retiro', 'show-branch'),
            createAction('Donde esta', 'show-location'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    if (stage === 'con_problema') {
        return [
            createAction('Que paso con mi envio', 'show-issues'),
            createAction('Reportar incidencia', 'report-incident-start'),
            createAction('Sucursal o retiro', 'show-branch'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    if (stage === 'entregado') {
        return [
            createAction('Estado actual', 'show-status'),
            createAction('Comprobante de entrega', 'show-pod'),
            createAction('No reconozco la entrega', 'show-delivery-issue'),
            createAction('Reportar incidencia', 'report-incident-start'),
        ];
    }

    if (stage === 'cancelado') {
        return [
            createAction('Estado actual', 'show-status'),
            createAction('Historial', 'show-history'),
            createAction('Hablar con soporte', 'show-support'),
        ];
    }

    return [
        createAction('Entender mi envio', 'show-understand-menu'),
        createAction('Donde esta y cuando llega', 'show-location-menu'),
        createAction('Hubo un problema', 'show-problem-menu'),
        createAction('Hablar con soporte', 'show-support'),
    ];
}

function buildShipmentSummary(shipment) {
    const lines = [
        '<div class="portal-chatbot-summary">',
        '<div class="portal-chatbot-summary-top">',
        '<strong>' + escapeHtml(shipment.trackingId || '-') + '</strong>',
        '<span class="portal-chatbot-status portal-chatbot-status--' + escapeHtml(shipment.statusKey || 'default') + '">' + escapeHtml(shipment.status || '-') + '</span>',
        '</div>',
        '<p><strong>Destino general:</strong> ' + escapeHtml(shipment.destination || '-') + '</p>',
    ];

    if (shipment.currentBranchName) {
        lines.push('<p><strong>Ultima referencia:</strong> ' + escapeHtml(shipment.currentBranchName) + '</p>');
    }

    if (shipment.expectedDeliveryDateLabel) {
        lines.push('<p><strong>Fecha estimada:</strong> ' + escapeHtml(shipment.expectedDeliveryDateLabel + (shipment.expectedDeliveryWindow ? ' - ' + shipment.expectedDeliveryWindow : '')) + '</p>');
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
        '<li><strong>Intento fallido:</strong> no se pudo completar la entrega en esa visita.</li>',
        '<li><strong>Paquete fallido:</strong> hubo un problema con el envio y el equipo tiene que revisarlo.</li>',
        '<li><strong>Retrasado:</strong> el envio viene con una demora respecto de lo esperado.</li>',
        '</ul>',
    ].join('');
}

function buildIncidentsHtml(incidents) {
    return [
        '<ul class="portal-chatbot-rich-list">',
        incidents.map((inc) => {
            const parts = [
                '<strong>' + escapeHtml(inc.typeLabel || 'Incidencia') + '</strong>',
                escapeHtml(inc.statusLabel || '-'),
            ];

            if (inc.createdAtLabel && inc.createdAtLabel !== '-') {
                parts.push('Abierta: ' + escapeHtml(inc.createdAtLabel));
            }

            if (inc.resolutionLabel) {
                parts.push('Resolucion: ' + escapeHtml(inc.resolutionLabel));
            }

            if (inc.closedAtLabel) {
                parts.push('Cerrada: ' + escapeHtml(inc.closedAtLabel));
            }

            return '<li>' + parts.join(' | ') + '</li>';
        }).join(''),
        '</ul>',
    ].join('');
}

// Incidencias agrupadas por envío (para "consultar incidencias de todos mis envíos").
function buildAllIncidentsHtml(shipments) {
    return shipments.map((s) => {
        const items = (s.incidents || []).map((inc) => {
            const parts = [
                '<strong>' + escapeHtml(inc.typeLabel || 'Incidencia') + '</strong>',
                escapeHtml(inc.statusLabel || '-'),
            ];
            if (inc.createdAtLabel && inc.createdAtLabel !== '-') {
                parts.push('Abierta: ' + escapeHtml(inc.createdAtLabel));
            }
            if (inc.resolutionLabel) {
                parts.push('Resolucion: ' + escapeHtml(inc.resolutionLabel));
            }
            return '<li>' + parts.join(' | ') + '</li>';
        }).join('');
        return [
            '<div class="portal-chatbot-summary">',
            '<div class="portal-chatbot-summary-top"><strong>' + escapeHtml(s.trackingId || '-') + '</strong>'
                + '<span>' + (s.incidents ? s.incidents.length : 0) + ' incidencia' + ((s.incidents && s.incidents.length === 1) ? '' : 's') + '</span></div>',
            '<ul class="portal-chatbot-rich-list">' + items + '</ul>',
            '</div>',
        ].join('');
    }).join('');
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
    buildAllIncidentsHtml,
    buildHistoryHtml,
    buildIncidentsHtml,
    buildIssuesHtml,
    buildMainMenuMessage,
    buildShipmentContextActions,
    buildShipmentSelectionHtml,
    buildShipmentSelectionActions,
    buildShipmentSummary,
    buildStatusGuideHtml,
    buildSupportHtml,
    createAction,
    createEffect,
    createMessage,
};
