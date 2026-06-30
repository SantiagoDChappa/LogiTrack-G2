// Sprint 3 utilities:
//  - Delivery secret code (4.1): 6-char alphanumeric, no ambiguous chars (0/O/1/I).
//  - Portal autogestion token (3.2): 32-char URL-safe, unique per shipment.

const crypto = require('crypto');

const SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateSecretCode = (length = 6) => {
    let out = '';
    const buf = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        out += SECRET_ALPHABET[buf[i] % SECRET_ALPHABET.length];
    }
    return out;
};

const PORTAL_TOKEN_TTL_HOURS = 72;

const generatePortalToken = () => crypto.randomBytes(24).toString('base64url');

const generatePortalTokenExpiry = () => {
    const d = new Date();
    d.setHours(d.getHours() + PORTAL_TOKEN_TTL_HOURS);
    return d;
};

module.exports = { generateSecretCode, generatePortalToken, generatePortalTokenExpiry, PORTAL_TOKEN_TTL_HOURS };
