// Cifrado simétrico del secreto TOTP en reposo (AES-256-GCM).
// La clave se deriva de JWT_SECRET para no introducir un secreto de entorno nuevo.
// Formato almacenado: "ivB64:tagB64:cipherB64".
const crypto = require('crypto');

const keyOf = () => crypto.createHash('sha256').update('2fa:' + (process.env.JWT_SECRET || 'dev-secret')).digest();

const encrypt = (plain) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
};

const decrypt = (blob) => {
    try {
        const [ivB, tagB, encB] = String(blob).split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(), Buffer.from(ivB, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
};

module.exports = { encrypt, decrypt };
