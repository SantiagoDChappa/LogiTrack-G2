// #2 2FA (TOTP) — generación/verificación de segundo factor y códigos de respaldo.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const { encrypt, decrypt } = require('../utils/twoFactorCrypto');

const ISSUER = 'LogiTrack';
// Tolerancia de ±1 paso (30s) para relojes ligeramente desfasados.
authenticator.options = { window: 1 };

const generateSecret = () => authenticator.generateSecret();

// URI otpauth que codifica el QR (compatible Google/Microsoft Authenticator).
const otpauthUrl = (email, secret) => authenticator.keyuri(email, ISSUER, secret);

const verifyToken = (token, secret) => {
    if (!token || !secret) { return false; }
    try {
        return authenticator.verify({ token: String(token).replace(/\s/g, ''), secret });
    } catch {
        return false;
    }
};

// Genera N códigos de respaldo. Devuelve { plain: ['xxxx-xxxx'...], hashed: [bcrypt...] }.
// El display lleva guion; el hash es de los 8 hex sin guion (para comparar tolerante).
const generateBackupCodes = async (n = 10) => {
    const plain = [];
    const hashed = [];
    for (let i = 0; i < n; i++) {
        const raw = crypto.randomBytes(4).toString('hex'); // 8 hex
        plain.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
        hashed.push(await bcrypt.hash(raw, 10));
    }
    return { plain, hashed };
};

// Compara un código de respaldo ingresado contra la lista de hashes.
// Devuelve el índice consumido o -1 si no coincide.
const matchBackupCode = async (code, hashedList) => {
    const clean = String(code || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
    if (clean.length < 8 || !Array.isArray(hashedList)) { return -1; }
    for (let i = 0; i < hashedList.length; i++) {
        if (await bcrypt.compare(clean, hashedList[i])) { return i; }
    }
    return -1;
};

module.exports = {
    ISSUER, generateSecret, otpauthUrl, verifyToken,
    generateBackupCodes, matchBackupCode, encrypt, decrypt,
};
