// Normalizacion CP argentino. Acepta formato corto (4 digitos) o largo CPA (letra + 4 + 3 letras).
// Valida prefijo letra contra provincia.

const PROVINCE_PREFIX = {
    1:  'B', // Buenos Aires
    2:  'K', // Catamarca
    3:  'H', // Chaco
    4:  'U', // Chubut
    5:  'X', // Cordoba
    6:  'W', // Corrientes
    7:  'E', // Entre Rios
    8:  'P', // Formosa
    9:  'Y', // Jujuy
    10: 'L', // La Pampa
    11: 'F', // La Rioja
    12: 'M', // Mendoza
    13: 'N', // Misiones
    14: 'Q', // Neuquen
    15: 'R', // Rio Negro
    16: 'A', // Salta
    17: 'J', // San Juan
    18: 'D', // San Luis
    19: 'Z', // Santa Cruz
    20: 'S', // Santa Fe
    21: 'G', // Santiago del Estero
    22: 'V', // Tierra del Fuego
    23: 'T', // Tucuman
    24: 'C', // CABA
};

const normalizePostalCode = (raw, provinceId) => {
    if (!raw) { return { ok: true, value: null }; }
    const trimmed = String(raw).trim().toUpperCase().replace(/\s+/g, '');
    const expectedPrefix = PROVINCE_PREFIX[Number(provinceId)];
    if (!expectedPrefix) { return { ok: true, value: trimmed }; }

    // Forma corta: solo 4 digitos -> agregar prefijo
    if (/^\d{4}$/.test(trimmed)) {
        return { ok: true, value: `${expectedPrefix}${trimmed}` };
    }
    // Forma CPA completa: 1 letra + 4 digitos + 3 letras
    const cpa = /^([A-Z])(\d{4})([A-Z]{3})$/.exec(trimmed);
    if (cpa) {
        if (cpa[1] !== expectedPrefix) {
            return { ok: false, reason: `CP "${trimmed}" empieza con "${cpa[1]}" pero la provincia requiere prefijo "${expectedPrefix}"` };
        }
        return { ok: true, value: trimmed };
    }
    // Forma intermedia: letra + 4 digitos
    const partial = /^([A-Z])(\d{4})$/.exec(trimmed);
    if (partial) {
        if (partial[1] !== expectedPrefix) {
            return { ok: false, reason: `CP "${trimmed}" empieza con "${partial[1]}" pero la provincia requiere prefijo "${expectedPrefix}"` };
        }
        return { ok: true, value: trimmed };
    }
    return { ok: false, reason: `CP "${trimmed}" no tiene formato válido (esperado: ${expectedPrefix}NNNN o ${expectedPrefix}NNNNXXX)` };
};

module.exports = { normalizePostalCode, PROVINCE_PREFIX };
