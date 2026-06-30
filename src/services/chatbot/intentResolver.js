const { INTENT_CATALOG } = require('./intentCatalog');
const {
    detectStatusKeyFromText,
    getShipmentStage,
    normalizeText,
    resolveLookupQuery,
} = require('./utils');

const EXACT_COURTESY_MESSAGES = new Set([
    'ok',
    'oka',
    'okay',
    'oki',
    'gracias',
    'ok gracias',
    'muchas gracias',
    'gracias bot',
    'dale',
    'listo',
    'perfecto',
    'genial',
    'joya',
    'bueno',
    'de una',
]);

const CHANGE_SHIPMENT_MESSAGES = new Set([
    'otro',
    'otra',
    'otro envio',
    'otra busqueda',
    'otro paquete',
    'buscar',
    'buscar envio',
    'buscar mi envio',
    'buscar otro envio',
    'quiero buscar otro envio',
    'quiero ver otro envio',
]);

const CLARIFIABLE_ACTIONS = new Set([
    'show-status',
    'show-history',
    'show-location',
    'show-eta',
    'show-issues',
    'show-branch',
    'show-pod',
    'show-delivery-issue',
    'show-management',
    'show-support',
]);

function tokenize(text) {
    return normalizeText(text).split(' ').filter(Boolean);
}

function getLevenshteinDistance(left, right) {
    const a = String(left || '');
    const b = String(right || '');

    if (!a) { return b.length; }
    if (!b) { return a.length; }

    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

    for (let row = 0; row <= a.length; row += 1) {
        matrix[row][0] = row;
    }

    for (let column = 0; column <= b.length; column += 1) {
        matrix[0][column] = column;
    }

    for (let row = 1; row <= a.length; row += 1) {
        for (let column = 1; column <= b.length; column += 1) {
            const cost = a[row - 1] === b[column - 1] ? 0 : 1;
            matrix[row][column] = Math.min(
                matrix[row - 1][column] + 1,
                matrix[row][column - 1] + 1,
                matrix[row - 1][column - 1] + cost
            );
        }
    }

    return matrix[a.length][b.length];
}

function tokensRoughlyMatch(candidate, token) {
    const left = normalizeText(candidate);
    const right = normalizeText(token);

    if (!left || !right) {
        return false;
    }

    if (left === right) {
        return true;
    }

    if (left.length >= 4 && right.length >= 4) {
        if (left.startsWith(right) || right.startsWith(left)) {
            return true;
        }
    }

    const maxLength = Math.max(left.length, right.length);
    const distance = getLevenshteinDistance(left, right);

    if (maxLength <= 4) {
        return distance <= 1;
    }

    return distance <= 2;
}

function hasApproximateToken(tokens, candidate) {
    return tokens.some((token) => tokensRoughlyMatch(candidate, token));
}

function scorePhrase(normalizedInput, inputTokens, phrase) {
    const normalizedPhrase = normalizeText(phrase);
    if (!normalizedPhrase) {
        return 0;
    }

    if (normalizedInput === normalizedPhrase) {
        return 12;
    }

    if (normalizedInput.includes(normalizedPhrase)) {
        return 9;
    }

    const phraseTokens = tokenize(normalizedPhrase);
    if (!phraseTokens.length) {
        return 0;
    }

    const matches = phraseTokens.filter((token) => hasApproximateToken(inputTokens, token)).length;

    if (matches === phraseTokens.length) {
        return phraseTokens.length >= 3 ? 8 : 7;
    }

    const coverage = matches / phraseTokens.length;
    if (phraseTokens.length >= 3 && coverage >= 0.75) {
        return 5;
    }

    return 0;
}

function scoreKeywordGroup(tokens, group) {
    const normalizedGroup = group.map((item) => normalizeText(item)).filter(Boolean);
    if (!normalizedGroup.length) {
        return 0;
    }

    const matches = normalizedGroup.filter((item) => hasApproximateToken(tokens, item)).length;
    if (matches === normalizedGroup.length) {
        return normalizedGroup.length >= 3 ? 6 : 5;
    }

    if (normalizedGroup.length >= 3 && matches / normalizedGroup.length >= 0.75) {
        return 3;
    }

    return 0;
}

function scoreKeywords(tokens, keywords) {
    return keywords.reduce((score, keyword) => (
        hasApproximateToken(tokens, keyword) ? score + 1 : score
    ), 0);
}

function scoreIntent(intent, normalizedInput, inputTokens, stage) {
    const phraseScore = Math.max(0, ...(intent.phrases || []).map((phrase) => scorePhrase(normalizedInput, inputTokens, phrase)));
    const groupScore = Math.max(0, ...(intent.keywordGroups || []).map((group) => scoreKeywordGroup(inputTokens, group)));
    const keywordScore = Math.min(3, scoreKeywords(inputTokens, intent.keywords || []));

    let total = Math.max(phraseScore, groupScore);
    if (keywordScore && total < 10) {
        total += keywordScore;
    }

    if (total > 0 && intent.stageBoosts && stage && intent.stageBoosts[stage]) {
        total += intent.stageBoosts[stage];
    }

    return total;
}

function rankIntents(normalizedInput, stage) {
    const inputTokens = tokenize(normalizedInput);

    return INTENT_CATALOG.map((intent) => ({
        action: intent.action,
        score: scoreIntent(intent, normalizedInput, inputTokens, stage),
    }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);
}

function buildActionResolution(action, value = '') {
    return {
        kind: 'action',
        action,
        value,
    };
}

function buildClarificationResolution(actions) {
    return {
        kind: 'clarify',
        actions,
    };
}

function isCourtesyMessage(normalized) {
    if (EXACT_COURTESY_MESSAGES.has(normalized)) {
        return true;
    }

    return ['gracias', 'perfecto', 'buenisimo', 'joya'].some((candidate) => normalized.startsWith(candidate));
}

function shouldRequestAnotherShipment(normalized, selectedShipment) {
    if (!selectedShipment) {
        return false;
    }

    if (CHANGE_SHIPMENT_MESSAGES.has(normalized)) {
        return true;
    }

    return normalized.includes('otro envio')
        || normalized.includes('otra busqueda')
        || normalized.includes('buscar otro')
        || normalized.includes('cambiar de envio');
}

function shouldPrioritizeDeliveryIssue(normalized, selectedShipment) {
    if (!selectedShipment || getShipmentStage(selectedShipment.statusKey) !== 'entregado') {
        return false;
    }

    const issueSignals = [
        ['entregado', 'no', 'llego'],
        ['entregado', 'no', 'tengo'],
        ['no', 'recibi'],
        ['no', 'reconozco', 'entrega'],
        ['figura', 'entregado'],
        ['aparece', 'entregado'],
    ];

    const tokens = tokenize(normalized);
    return issueSignals.some((group) => group.every((item) => hasApproximateToken(tokens, item)));
}

function shouldClarifyLocationVsEta(normalized) {
    const hasLocationSignal = normalized.includes('donde') || normalized.includes('ubicacion') || normalized.includes('recorrido');
    const hasEtaSignal = normalized.includes('cuando') || normalized.includes('llega') || normalized.includes('fecha estimada');

    return normalized.includes(' o ') && hasLocationSignal && hasEtaSignal;
}

function isExplicitStatusGuideQuery(normalized, explicitStatus) {
    if (!explicitStatus) {
        return false;
    }

    return normalized.includes('que significa')
        || normalized.includes('significa')
        || normalized.includes('explicame')
        || normalized === explicitStatus.replace(/_/g, ' ');
}

function resolveRankedIntents(ranked) {
    if (!ranked.length) {
        return { kind: 'fallback' };
    }

    const [best, second] = ranked;
    if (best.score >= 7) {
        if (
            second
            && CLARIFIABLE_ACTIONS.has(best.action)
            && CLARIFIABLE_ACTIONS.has(second.action)
            && second.score >= 6
            && Math.abs(best.score - second.score) <= 1
            && best.action !== second.action
        ) {
            return buildClarificationResolution([best.action, second.action]);
        }

        return buildActionResolution(best.action);
    }

    if (
        best.score >= 5
        && second
        && CLARIFIABLE_ACTIONS.has(best.action)
        && CLARIFIABLE_ACTIONS.has(second.action)
        && Math.abs(best.score - second.score) <= 1
        && best.action !== second.action
    ) {
        return buildClarificationResolution([best.action, second.action]);
    }

    if (best.score >= 4) {
        return buildActionResolution(best.action);
    }

    return { kind: 'fallback' };
}

function resolveTextIntent(input, options = {}) {
    const trimmed = String(input || '').trim();
    const normalized = normalizeText(trimmed);
    const lookup = resolveLookupQuery(trimmed);
    const selectedShipment = options.selectedShipment || null;
    const stage = selectedShipment ? getShipmentStage(selectedShipment.statusKey) : '';

    if (lookup) {
        return {
            kind: 'lookup',
            query: lookup.query,
        };
    }

    if (!normalized) {
        return { kind: 'fallback' };
    }

    const explicitStatus = detectStatusKeyFromText(normalized);
    if (isExplicitStatusGuideQuery(normalized, explicitStatus)) {
        return buildActionResolution('show-status-guide', explicitStatus);
    }

    if (isCourtesyMessage(normalized)) {
        return buildActionResolution('show-acknowledgement');
    }

    if (shouldRequestAnotherShipment(normalized, selectedShipment)) {
        return buildActionResolution('request-lookup');
    }

    if (shouldPrioritizeDeliveryIssue(normalized, selectedShipment)) {
        return buildActionResolution('show-delivery-issue');
    }

    if (shouldClarifyLocationVsEta(normalized)) {
        return buildClarificationResolution(['show-location', 'show-eta']);
    }

    return resolveRankedIntents(rankIntents(normalized, stage));
}

module.exports = {
    resolveTextIntent,
};
