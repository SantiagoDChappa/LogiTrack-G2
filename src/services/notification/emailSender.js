const nodemailer = require('nodemailer');
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// Estrategia de envío:
//  1) Si hay API key de SendGrid -> se usa la API HTTP (https://api.sendgrid.com).
//     Render bloquea los puertos SMTP salientes (CONN ETIMEDOUT), pero NO bloquea
//     HTTPS (443), así que la API funciona donde el SMTP se cuelga.
//  2) Si no hay API key -> se cae a SMTP genérico (SMTP_HOST) o Gmail (desarrollo).
// ─────────────────────────────────────────────────────────────────────────────

// API key de SendGrid: explícita (SENDGRID_API_KEY) o reutilizando SMTP_PASS si
// es una key de SendGrid (empieza con "SG.").
const SENDGRID_KEY = process.env.SENDGRID_API_KEY
    || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('SG.') ? process.env.SMTP_PASS : null);
const USE_SENDGRID_API = Boolean(SENDGRID_KEY);

// Timeouts SMTP: si el servidor no responde preferimos fallar rápido en vez de
// dejar la request/job colgada "cargando".
const SMTP_TIMEOUTS = {
    connectionTimeout: 10000, // 10s para abrir la conexión TCP
    greetingTimeout:   10000, // 10s para el saludo del servidor
    socketTimeout:     20000, // 20s de inactividad del socket
};

// Remitente. EMAIL_FROM admite "Nombre <email>"; lo parseamos para la API.
const fromRaw = () => (process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
function parseFrom() {
    const raw = fromRaw();
    const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
    if (m) { return { email: m[2].trim(), name: (m[1] || '').trim() || undefined }; }
    return { email: raw };
}

// Quita etiquetas HTML para generar un fallback de texto plano.
const htmlToText = (html) => String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ── Transporter SMTP (solo si NO usamos la API de SendGrid) ───────────────────
function buildTransporter() {
    if (process.env.SMTP_HOST) {
        const port = Number(process.env.SMTP_PORT) || 587;
        const cfg = {
            host: process.env.SMTP_HOST,
            port,
            // 465 = SSL implícito; 587/2525 = STARTTLS. Override con SMTP_SECURE=true/false.
            secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
            auth: {
                user: process.env.SMTP_USER || process.env.EMAIL_USER,
                pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
            },
            ...SMTP_TIMEOUTS,
        };
        console.log(`[email] transporter SMTP -> host=${cfg.host} port=${cfg.port} secure=${cfg.secure} user=${cfg.auth.user}`);
        return nodemailer.createTransport(cfg);
    }
    console.log('[email] transporter -> servicio Gmail (modo desarrollo, sin SMTP_HOST)');
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        ...SMTP_TIMEOUTS,
    });
}

// Solo construimos/verificamos el transporter SMTP cuando realmente se usa.
const transporter = USE_SENDGRID_API ? null : buildTransporter();

if (process.env.NODE_ENV !== 'test') {
    if (USE_SENDGRID_API) {
        console.log(`[email] modo SendGrid HTTP API (sobre HTTPS) -> from=${fromRaw()}`);
    } else {
        transporter.verify()
            .then(() => console.log('[email] conexión SMTP verificada: el servidor acepta mensajes ✔'))
            .catch((err) => console.error('[email] FALLO al verificar SMTP:', err && err.message ? err.message : err));
    }
}

// ── Envío vía API HTTP de SendGrid (HTTPS, no bloqueado por Render) ────────────
async function sendViaSendGridApi(recipients, subject, content, format) {
    const from = parseFrom();
    const contentArr = (format === 'html')
        // SendGrid exige el contenido en orden de preferencia ascendente: texto primero.
        ? [{ type: 'text/plain', value: htmlToText(content) }, { type: 'text/html', value: content }]
        : [{ type: 'text/plain', value: content }];

    const payload = {
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from,
        subject,
        content: contentArr,
    };

    console.log(`[email] enviando (SendGrid API) -> to=${recipients.join(', ')} subject="${subject}" from=${from.email}`);
    try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SENDGRID_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) { // 202 Accepted
            console.log(`[email] ENVIADO ✔ (SendGrid API) to=${recipients.join(', ')} status=${res.status} msgId=${res.headers.get('x-message-id') || '-'}`);
            return true;
        }
        const errBody = await res.text().catch(() => '');
        console.error(`[email] ERROR (SendGrid API) status=${res.status} to=${recipients.join(', ')} body=${errBody}`);
        return false;
    } catch (error) {
        console.error(`[email] ERROR (SendGrid API) to=${recipients.join(', ')}:`, error && error.message ? error.message : error);
        return false;
    }
}

// ── Envío vía SMTP (nodemailer) ───────────────────────────────────────────────
async function sendViaSmtp(recipients, subject, content, format) {
    const data = { from: fromRaw(), to: recipients.join(', '), subject };
    if (format === 'html') {
        data.html = content;
        data.text = htmlToText(content); // fallback texto plano
    } else {
        data.text = content;
    }

    console.log(`[email] enviando (SMTP) -> to=${data.to} subject="${subject}" from=${data.from} format=${format}`);
    try {
        const info = await transporter.sendMail(data);
        console.log(`[email] ENVIADO ✔ (SMTP) to=${data.to} messageId=${info.messageId || '-'} response=${info.response || '-'}`);
        return true;
    } catch (error) {
        console.error(`[email] ERROR (SMTP) enviando a ${data.to}:`, {
            message: error.message,
            code:    error.code,
            command: error.command,
            response: error.response,
        });
        return false;
    }
}

async function sendEmail(to, subject, content, format = 'text') {
    const recipients = []
        .concat(to || [])
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim())
        .filter(Boolean);
    if (recipients.length === 0) {
        console.warn('[email] sendEmail: sin destinatarios válidos, no se envía');
        return false;
    }

    return USE_SENDGRID_API
        ? sendViaSendGridApi(recipients, subject, content, format)
        : sendViaSmtp(recipients, subject, content, format);
}

module.exports = { sendEmail };
