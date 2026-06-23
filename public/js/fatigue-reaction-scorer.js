/* Ojo de Patrón — scoring del test de REACCIÓN del lado del cliente.
 * Espejo EXACTO de src/services/fatigue/scorer.js (scoreFromReaction + evaluateReaction
 * + decide) para poder puntuar y decidir el bloqueo SIN conexión, con el mismo criterio
 * que el servidor. El server re-valida al sincronizar (la decisión local es un adelanto).
 * UMD: se expone como window.LTFatigueScorer en el navegador y como module.exports en Node
 * (para el test de paridad). Mantener en sync con el server — hay test que lo verifica.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (root) { root.LTFatigueScorer = api; }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    // Tiempo MEDIO de reacción → fatiga 0–100. fastMs→0, slowMs→100.
    function scoreFromReaction(reactionsMs, fastMs, slowMs) {
        const valid = (reactionsMs || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (valid.length === 0) { return 100; }  // sin datos → fail-safe (máxima fatiga)
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        const lo = Number(fastMs) || 250;
        const hi = Number(slowMs) || 800;
        if (hi <= lo) { return avg <= lo ? 0 : 100; }
        return clamp(Math.round(((avg - lo) / (hi - lo)) * 100), 0, 100);
    }

    // Evaluación del test según el modo configurado (PROMEDIO | APROBADOS). Devuelve
    // { score, apto, decision, ...detalle }. Idéntico a evaluateReaction del server.
    function evaluateReaction(opts) {
        const o = opts || {};
        const reactionsMs = o.reactionsMs || [];
        const fastMs = o.fastMs, slowMs = o.slowMs;
        const mode = o.mode || 'PROMEDIO';
        const required = o.required || 'MITAD';
        const autoBlock = o.autoBlock !== undefined ? o.autoBlock : true;

        const valid = reactionsMs.map(Number).filter((n) => Number.isFinite(n) && n > 0);
        const score = scoreFromReaction(valid, fastMs, slowMs);
        const limit = Number(slowMs) || 800;
        const total = valid.length;
        const passedCount = valid.filter((ms) => ms <= limit).length;
        const avg = total ? Math.round(valid.reduce((a, b) => a + b, 0) / total) : null;
        const need = required === 'UNO' ? 1 : (required === 'TODOS' ? total : Math.ceil(total / 2));
        const detail = { mode: mode, required: required, limit: limit, total: total, passedCount: passedCount, avg: avg, need: total ? need : 0 };
        if (!total) { return Object.assign({ score: 100, apto: false, decision: autoBlock ? 'BLOCKED' : 'APTO' }, detail); }
        const apto = mode === 'APROBADOS' ? (passedCount >= need) : (avg <= limit);
        const decision = (!autoBlock || apto) ? 'APTO' : 'BLOCKED';
        return Object.assign({ score: score, apto: apto, decision: decision }, detail);
    }

    return { clamp: clamp, scoreFromReaction: scoreFromReaction, evaluateReaction: evaluateReaction };
});
