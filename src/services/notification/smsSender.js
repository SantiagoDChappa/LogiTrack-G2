// LGT-219: envío de SMS por Twilio con degradación elegante.
// Si no hay credenciales (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM) o el destinatario
// no tiene teléfono, se omite y se registra el motivo; nunca lanza al caller.
let _client = null; // null = sin resolver, false = no disponible, obj = cliente

const getClient = () => {
    if (_client !== null) { return _client; }
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) { _client = false; return _client; }
    try {
        // require diferido: solo si hay credenciales (evita dependencia dura en dev/CI).
        _client = require('twilio')(sid, token);
    } catch (e) {
        console.warn('[sms] paquete twilio no disponible:', e.message);
        _client = false;
    }
    return _client;
};

const sendSms = async (to, body) => {
    if (!to) { return { ok: false, skipped: 'no_phone' }; }
    const from = process.env.TWILIO_FROM;
    const client = getClient();
    if (!client || !from) {
        console.warn('[sms] sin credenciales Twilio — SMS omitido para', String(to));
        return { ok: false, skipped: 'no_credentials' };
    }
    try {
        await client.messages.create({ to: String(to), from, body: String(body || '').slice(0, 1000) });
        return { ok: true };
    } catch (e) {
        console.error('[sms] error enviando a', String(to), ':', e.message);
        return { ok: false, error: e.message };
    }
};

module.exports = { sendSms };
