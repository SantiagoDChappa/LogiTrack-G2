const { STATUS_ALIASES, STATUS_COPY } = require('./constants');

function normalizeText(value) {
    let normalized = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]+/g, ' ');

    const replacements = [
        [/\bdnd\b/g, 'donde'],
        [/\bcndo\b/g, 'cuando'],
        [/\bcmo\b/g, 'como'],
        [/\bxq\b/g, 'porque'],
        [/\bpq\b/g, 'porque'],
        [/\bq\b/g, 'que'],
        [/\bk\b/g, 'que'],
        [/\bsta\b/g, 'esta'],
        [/\btoy\b/g, 'estoy'],
        [/\bqro\b/g, 'quiero'],
        [/\bmsj\b/g, 'mensaje'],
    ];

    replacements.forEach(([pattern, replacement]) => {
        normalized = normalized.replace(pattern, replacement);
    });

    return normalized
        .replace(/([a-z])\1{2,}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsAny(value, candidates) {
    return candidates.some((candidate) => String(value || '').includes(candidate));
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function detectStatusKeyFromText(text) {
    const entries = Object.entries(STATUS_ALIASES);
    for (let index = 0; index < entries.length; index += 1) {
        const [key, aliases] = entries[index];
        if (aliases.some((alias) => text.includes(alias))) {
            return key;
        }
    }
    return '';
}

function getStatusCopy(statusKey) {
    return STATUS_COPY[statusKey] || STATUS_COPY.default;
}

function getShipmentStage(statusKey) {
    const key = String(statusKey || '');

    if (['pendiente', 'inicial', 'asignado', 'en_preparacion'].includes(key)) {
        return 'aun_no_salio';
    }

    if (key === 'en_transito') {
        return 'en_camino';
    }

    if (key === 'en_sucursal') {
        return 'en_sucursal';
    }

    if (['retrasado', 'intento_fallido', 'paquete_fallido'].includes(key)) {
        return 'con_problema';
    }

    if (key === 'entregado') {
        return 'entregado';
    }

    if (key === 'cancelado' || key === 'cancelada') {
        return 'cancelado';
    }

    return 'default';
}

function resolveLookupQuery(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) { return null; }

    const trackingMatch = trimmed.toUpperCase().match(/\b([A-Z]{3,6})[-\s]?(\d{2,})\b/);
    if (trackingMatch) {
        return {
            isDocument: false,
            query: trackingMatch[1] + '-' + trackingMatch[2],
        };
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (/^\d{7,10}$/.test(digitsOnly)) {
        return {
            isDocument: true,
            query: digitsOnly,
        };
    }

    return null;
}

function isValidString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function cloneActions(actions) {
    return Array.isArray(actions)
        ? actions.map((item) => ({ ...item }))
        : [];
}

module.exports = {
    cloneActions,
    containsAny,
    detectStatusKeyFromText,
    escapeHtml,
    getShipmentStage,
    getStatusCopy,
    isValidString,
    normalizeText,
    resolveLookupQuery,
};
