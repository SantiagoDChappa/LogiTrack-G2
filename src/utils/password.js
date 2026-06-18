// Política de contraseñas compartida por alta de usuario, primer ingreso y reset.
// Mismas reglas que la validación histórica (middlewares/user.js): 10-128 chars,
// al menos una mayúscula, un número y un símbolo.
const crypto = require('crypto');

const PASSWORD_POLICY = { minLength: 10, maxLength: 128 };

const meetsPolicy = (pwd) => {
    const p = String(pwd || '');
    return p.length >= PASSWORD_POLICY.minLength
        && p.length <= PASSWORD_POLICY.maxLength
        && /[A-Z]/.test(p)
        && /\d/.test(p)
        && /[^A-Za-z0-9]/.test(p);
};

// Devuelve el primer error de política (o null si cumple). Mensajes para mostrar al usuario.
const policyError = (pwd) => {
    const p = String(pwd || '');
    if (p.length < PASSWORD_POLICY.minLength) { return 'La contraseña debe tener al menos 10 caracteres.'; }
    if (p.length > PASSWORD_POLICY.maxLength) { return 'La contraseña no puede superar 128 caracteres.'; }
    if (!/[A-Z]/.test(p))        { return 'La contraseña debe contener al menos una mayúscula.'; }
    if (!/\d/.test(p))           { return 'La contraseña debe contener al menos un número.'; }
    if (!/[^A-Za-z0-9]/.test(p)) { return 'La contraseña debe contener al menos un símbolo.'; }
    return null;
};

// Genera una contraseña temporal fuerte (12 chars) que cumple la política.
// Garantiza al menos un carácter de cada clase y mezcla con CSPRNG.
// Excluye caracteres ambiguos (0/O/1/l/I) para que sea fácil de dictar.
const generateTempPassword = () => {
    const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower  = 'abcdefghijkmnpqrstuvwxyz';
    const digit  = '23456789';
    const symbol = '!@#$%&*?';
    const all = upper + lower + digit + symbol;
    const pick = (set) => set[crypto.randomInt(set.length)];
    const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
    while (chars.length < 12) { chars.push(pick(all)); }
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
};

module.exports = { PASSWORD_POLICY, meetsPolicy, policyError, generateTempPassword };
