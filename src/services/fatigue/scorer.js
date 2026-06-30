// Ojo de Patrón — cálculo del nivel de fatiga 0–100 (US-3).
// PRIMERA VERSIÓN MOCK: contrato estable, sin modelo real.
// Integración futura: ml/api.py POST /fatigue (ver ML_FATIGUE_URL).
// Ley 25.326: recibe métricas efímeras; NUNCA persiste el dato crudo.

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Test de reacción (US-9): mapea el tiempo MEDIO de reacción a fatiga.
// fastMs (muy alerta) → 0 ; slowMs (límite, muy lento) → 100. Configurable.
function scoreFromReaction(reactionsMs = [], fastMs = 250, slowMs = 800) {
    const valid = reactionsMs.map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (valid.length === 0) { return 100; } // sin datos → fail-safe (máxima fatiga)
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const lo = Number(fastMs) || 250;
    const hi = Number(slowMs) || 800;
    if (hi <= lo) { return avg <= lo ? 0 : 100; }
    return clamp(Math.round(((avg - lo) / (hi - lo)) * 100), 0, 100);
}

// Voz: deriva la fatiga de la prueba de lectura de frase (reconocimiento de voz).
//  - mockScore: fuerza un valor (tests / demo).
//  - acousticScore (0..100): fatiga calculada por análisis ACÚSTICO real del audio
//    (velocidad de habla, pausas, F0 y su variabilidad, dinámica de energía). Es la
//    señal preferida: la lectura correcta de la frase es solo el "gate" de cooperación.
//  - matchRatio (0..1): qué tan bien coincidió lo leído con la frase (fallback).
//  - durationMs/expectedMs: fallback legacy (mock por duración).
function scoreFromVoice({ durationMs, expectedMs = 5000, mockScore, matchRatio, acousticScore, phraseGateFailed } = {}) {
    if (phraseGateFailed) { return 100; } // no pudo leer la frase tras los intentos → fatiga máxima
    if (Number.isFinite(mockScore)) { return clamp(Math.round(mockScore), 0, 100); }
    if (Number.isFinite(acousticScore)) { return clamp(Math.round(acousticScore), 0, 100); }
    if (Number.isFinite(matchRatio)) {
        const m = clamp(matchRatio, 0, 1);
        return clamp(Math.round(100 - m * 90), 0, 100);
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) { return 100; }
    const ratio = clamp(durationMs / expectedMs, 0, 1);
    // ratio 1 (muestra completa) → fatiga baja (~15); ratio 0 → alta (100).
    return clamp(Math.round(100 - ratio * 85), 0, 100);
}

// Punto de entrada. method: 'VOZ' | 'REACCION'. metrics según método.
// cfg (opcional) aporta los límites configurables del test de reacción.
function score({ method, metrics = {}, cfg } = {}) {
    if (method === 'REACCION') { return scoreFromReaction(metrics.reactionsMs, cfg && cfg.reactionFastMs, cfg && cfg.reactionSlowMs); }
    if (method === 'VOZ')      { return scoreFromVoice(metrics); }
    throw new Error(`Método de prueba inválido: ${method}`);
}

// Decisión de aptitud según el score y la config ya coercionada.
function decide(scoreValue, cfg) {
    if (cfg && cfg.autoBlock && scoreValue > cfg.thresholdPct) { return 'BLOCKED'; }
    return 'APTO';
}

// Evaluación del test de reacción según el modo configurado.
//  - PROMEDIO: apto si el promedio de los intentos ≤ reactionSlowMs (el límite).
//  - APROBADOS: apto si la cantidad de intentos bajo el límite alcanza el requerido
//    (UNO = ≥1, MITAD = ≥mitad redondeada hacia arriba, TODOS = todos).
// Devuelve { score, apto, decision, ...detalle }. El detalle (avg, passedCount, total,
// limit, mode, required, need) permite explicar el veredicto en la UI (US-9/US-10).
function evaluateReaction({ reactionsMs = [], fastMs, slowMs, mode = 'PROMEDIO', required = 'MITAD', autoBlock = true } = {}) {
    const valid = reactionsMs.map(Number).filter(n => Number.isFinite(n) && n > 0);
    const score = scoreFromReaction(valid, fastMs, slowMs);
    const limit = Number(slowMs) || 800;
    const total = valid.length;
    const passedCount = valid.filter(ms => ms <= limit).length;
    const avg = total ? Math.round(valid.reduce((a, b) => a + b, 0) / total) : null;
    const need = required === 'UNO' ? 1 : (required === 'TODOS' ? total : Math.ceil(total / 2));
    const detail = { mode, required, limit, total, passedCount, avg, need: total ? need : 0 };
    if (!total) { return { score: 100, apto: false, decision: autoBlock ? 'BLOCKED' : 'APTO', ...detail }; }
    const apto = mode === 'APROBADOS' ? (passedCount >= need) : (avg <= limit);
    const decision = (!autoBlock || apto) ? 'APTO' : 'BLOCKED';
    return { score, apto, decision, ...detail };
}

module.exports = { clamp, scoreFromReaction, scoreFromVoice, score, decide, evaluateReaction };
