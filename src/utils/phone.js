// Validación de teléfonos argentinos por característica (código de área) real.
// Regla del plan de numeración: área + abonado = 10 dígitos; el celular antepone un 9 (→ 11).
// Características principales de 2/3 dígitos (set conocido). Las de 4 dígitos (pueblos)
// se aceptan estructuralmente si empiezan con 2 o 3, ya que todas arrancan así.

const KNOWN_AREAS = new Set([
    '11',
    '220', '221', '223', '230', '236', '237', '249',
    '260', '261', '263', '264', '266', '280', '291', '294', '297', '298', '299',
    '341', '342', '343', '345', '348', '351', '353', '358',
    '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388',
]);

const onlyDigits = (s) => String(s === null || s === undefined ? '' : s).replace(/\D/g, '');

// Devuelve la característica detectada o null (3 dígitos conocidos > 2 dígitos > 4 dígitos 2x/3x).
const detectArea = (rest) => {
    if (KNOWN_AREAS.has(rest.slice(0, 3))) { return rest.slice(0, 3); }
    if (KNOWN_AREAS.has(rest.slice(0, 2))) { return rest.slice(0, 2); }
    if (/^[23]\d{3}$/.test(rest.slice(0, 4))) { return rest.slice(0, 4); }
    return null;
};

// Parsea un teléfono (dígitos planos). { ok, mobile, area, subscriber, digits } o { ok:false, reason }.
const parseArPhone = (raw) => {
    const d = onlyDigits(raw);
    if (!d) { return { ok: false, reason: 'empty' }; }
    const mobile = d[0] === '9';
    const rest = mobile ? d.slice(1) : d;
    const area = detectArea(rest);
    if (!area) { return { ok: false, reason: 'area', digits: d, mobile }; }
    if (rest.length !== 10) { return { ok: false, reason: 'length', area, digits: d, mobile }; }
    return { ok: true, mobile, area, subscriber: rest.slice(area.length), digits: d };
};

const isValidArPhone = (raw) => parseArPhone(raw).ok;

module.exports = { KNOWN_AREAS, detectArea, parseArPhone, isValidArPhone };
