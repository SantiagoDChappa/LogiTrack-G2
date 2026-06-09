// Ojo de Patrón — parámetros configurables (US-7).
// Los modelos se requieren de forma perezosa (lazy) para que los helpers puros
// sean testeables sin conexión a la base de datos.
// Defaults globales; cada sucursal puede sobreescribir (valor para el cliente).

const DEFAULTS = Object.freeze({
    enabled:           'true',   // feature on/off
    autoBlock:         'true',   // bloquear automáticamente al superar el umbral
    thresholdPct:      '85',     // % de fatiga que dispara bloqueo
    method:            'AMBOS',  // VOZ | REACCION | AMBOS (métodos habilitados)
    methodStart:       'VOZ',    // método usado al iniciar la ruta
    methodRecheck:     'REACCION', // método usado en el re-chequeo en ruta
    testDurationSec:   '5',      // duración de la prueba
    voiceAcousticEnabled: 'true', // medir fatiga vocal por análisis acústico (requiere STT)
    voiceMaxAttempts:  '3',      // intentos máximos de leer la frase; agotados → bloqueado
    reactionFastMs:    '250',    // reacción "muy alerta" → fatiga 0
    reactionSlowMs:    '800',    // límite de reacción: más lento → fatiga 100
    reactionAttempts:  '3',      // cantidad de intentos del test de reacción
    reactionEvalMode:  'PROMEDIO', // PROMEDIO (avg ≤ límite) | APROBADOS (cuántos pasan)
    reactionRequired:  'MITAD',  // si APROBADOS: UNO | MITAD | TODOS bajo el límite
    recheckDriveMin:   '90',     // min de conducción que habilita re-chequeo
    recheckStoppedMin: '3',      // min detenido que dispara re-chequeo
    recheckRestMin:    '30',     // min de descanso para reintentar prueba tras bloqueo en ruta (LGT-199)
    patternWindowDays: '30',     // ventana para patrón recurrente
    patternEventCount: '3',      // N.º de bloqueos que marca patrón
    retentionDays:     '90',     // retención de registros (Ley 25.326 art. 4)
    consentVersion:    'v1',     // versión del texto de consentimiento
});

const NUMERIC_RANGES = Object.freeze({
    thresholdPct:      [0, 100],
    testDurationSec:   [1, 60],
    reactionFastMs:    [50, 2000],
    reactionSlowMs:    [100, 5000],
    voiceMaxAttempts:  [1, 10],
    reactionAttempts:  [1, 10],
    recheckDriveMin:   [1, 1440],
    recheckStoppedMin: [1, 240],
    recheckRestMin:    [1, 720],
    patternWindowDays: [1, 365],
    patternEventCount: [1, 50],
    retentionDays:     [1, 3650],
});
const ENUM_VALUES = Object.freeze({
    method:        ['VOZ', 'REACCION', 'AMBOS'],
    methodStart:   ['VOZ', 'REACCION', 'AMBOS'], // AMBOS: el conductor elige voz o reacción
    methodRecheck: ['VOZ', 'REACCION', 'AMBOS'],
    reactionEvalMode: ['PROMEDIO', 'APROBADOS'],
    reactionRequired: ['UNO', 'MITAD', 'TODOS'],
});
const BOOL_PARAMS = Object.freeze(['enabled', 'autoBlock', 'voiceAcousticEnabled']);

// ── Helpers puros (testeables sin DB) ───────────────────────────────────────
function coerce(merged) {
    const out = {};
    for (const [k, v] of Object.entries(merged)) {
        if (BOOL_PARAMS.includes(k)) { out[k] = (v === 'true' || v === true); }
        else if (NUMERIC_RANGES[k])  { out[k] = Number(v); }
        else                         { out[k] = v; }
    }
    return out;
}

// Mezcla defaults < valores globales (branch=null) < valores de la sucursal.
function mergeRows(rows, branchId) {
    const merged = { ...DEFAULTS };
    const globals = rows.filter(r => r.branchId === null || r.branchId === undefined);
    const locals  = rows.filter(r => r.branchId === branchId);
    for (const r of globals) { if (r.param in merged) { merged[r.param] = r.value; } }
    for (const r of locals)  { if (r.param in merged) { merged[r.param] = r.value; } }
    return coerce(merged);
}

// Valida un par (param, value). Devuelve { ok, value, error }.
function validateParam(param, rawValue) {
    if (!(param in DEFAULTS)) { return { ok: false, error: `Parámetro desconocido: ${param}` }; }
    const value = String(rawValue).trim();
    if (BOOL_PARAMS.includes(param)) {
        if (!['true', 'false'].includes(value)) { return { ok: false, error: `${param} debe ser true o false` }; }
        return { ok: true, value };
    }
    if (ENUM_VALUES[param]) {
        if (!ENUM_VALUES[param].includes(value)) { return { ok: false, error: `${param} debe ser uno de: ${ENUM_VALUES[param].join(', ')}` }; }
        return { ok: true, value };
    }
    if (NUMERIC_RANGES[param]) {
        const n = Number(value);
        const [min, max] = NUMERIC_RANGES[param];
        if (!Number.isFinite(n) || n < min || n > max) { return { ok: false, error: `${param} debe estar entre ${min} y ${max}` }; }
        return { ok: true, value: String(n) };
    }
    return { ok: true, value }; // consentVersion u otros strings libres
}

// ── Acceso a DB ─────────────────────────────────────────────────────────────
async function getConfig(branchId = null) {
    const { Op } = require('sequelize');
    const { FatigueConfig } = require('../../models/fatigueConfig');
    const rows = await FatigueConfig.findAll({
        where: { [Op.or]: [{ branchId: null }, { branchId }] },
    });
    return mergeRows(rows.map(r => r.toJSON()), branchId);
}

async function setParam(param, rawValue, { branchId = null, actorId = null } = {}) {
    const { FatigueConfig } = require('../../models/fatigueConfig');
    const v = validateParam(param, rawValue);
    if (!v.ok) { throw new Error(v.error); }
    const where = { param, branchId };
    const existing = await FatigueConfig.findOne({ where });
    if (existing) {
        await existing.update({ value: v.value, updatedBy: actorId, updatedAt: new Date() });
    } else {
        await FatigueConfig.create({ param, value: v.value, branchId, updatedBy: actorId });
    }
    return v.value;
}

module.exports = {
    DEFAULTS, NUMERIC_RANGES, ENUM_VALUES, BOOL_PARAMS,
    coerce, mergeRows, validateParam, getConfig, setParam,
};
