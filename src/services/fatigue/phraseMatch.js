// Ojo de Patrón — coincidencia de frase (server-side), mismo criterio que el
// cliente: normaliza, Levenshtein por palabra, sensible al orden.
// Usado por la prueba de voz server-side (STT) para calcular el matchRatio.

function normalizarTexto(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshteinPalabras(a, b) {
    const m = a.length, n = b.length;
    if (!m) { return n; }
    if (!n) { return m; }
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[n];
}

// Coincidencia 0..1: frase exacta → 1; frase mal dicha → baja.
function similitudFrase(dicho, esperado) {
    const a = normalizarTexto(dicho).split(' ').filter(Boolean);
    const b = normalizarTexto(esperado).split(' ').filter(Boolean);
    if (!a.length || !b.length) { return 0; }
    const dist = levenshteinPalabras(a, b);
    return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}

module.exports = { normalizarTexto, levenshteinPalabras, similitudFrase };
