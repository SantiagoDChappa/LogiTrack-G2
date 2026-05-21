const { STATUS_ALIASES, STATUS_COPY } = require('./constants');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]+/g, ' ')
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

function resolveLookupQuery(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) { return null; }

    const trackingMatch = trimmed.toUpperCase().match(/\b[A-Z]{3,6}-\d{2,}\b/);
    if (trackingMatch) {
        return {
            isDocument: false,
            query: trackingMatch[0],
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
    getStatusCopy,
    isValidString,
    normalizeText,
    resolveLookupQuery,
};
