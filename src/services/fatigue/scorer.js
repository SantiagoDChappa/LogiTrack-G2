// Ojo de Patrón — cálculo del nivel de fatiga 0–100 (US-3).
// PRIMERA VERSIÓN MOCK: contrato estable, sin modelo real.
// Integración futura: ml/api.py POST /fatigue (ver ML_FATIGUE_URL).
// Ley 25.326: recibe métricas efímeras; NUNCA persiste el dato crudo.

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Test de reacción (US-9): mapea el tiempo medio de reacción a fatiga.
// 250 ms (muy alerta) → 0 ; 800 ms (muy lento) → 100.
function scoreFromReaction(reactionsMs = []) {
    const valid = reactionsMs.map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (valid.length === 0) { return 100; } // sin datos → fail-safe (máxima fatiga)
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return clamp(Math.round(((avg - 250) / (800 - 250)) * 100), 0, 100);
}

// Voz (mock): deriva un pseudo-score determinístico de la duración capturada
// respecto de la esperada. Una muestra más corta de lo pedido → más "fatiga".
// Permite metrics.mockScore para forzar un valor (tests / demo).
function scoreFromVoice({ durationMs, expectedMs = 5000, mockScore } = {}) {
    if (Number.isFinite(mockScore)) { return clamp(Math.round(mockScore), 0, 100); }
    if (!Number.isFinite(durationMs) || durationMs <= 0) { return 100; }
    const ratio = clamp(durationMs / expectedMs, 0, 1);
    // ratio 1 (muestra completa) → fatiga baja (~15); ratio 0 → alta (100).
    return clamp(Math.round(100 - ratio * 85), 0, 100);
}

// Punto de entrada. method: 'VOZ' | 'REACCION'. metrics según método.
function score({ method, metrics = {} } = {}) {
    if (method === 'REACCION') { return scoreFromReaction(metrics.reactionsMs); }
    if (method === 'VOZ')      { return scoreFromVoice(metrics); }
    throw new Error(`Método de prueba inválido: ${method}`);
}

// Decisión de aptitud según el score y la config ya coercionada.
function decide(scoreValue, cfg) {
    if (cfg && cfg.autoBlock && scoreValue > cfg.thresholdPct) { return 'BLOCKED'; }
    return 'APTO';
}

module.exports = { clamp, scoreFromReaction, scoreFromVoice, score, decide };
