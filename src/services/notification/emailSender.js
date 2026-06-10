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

// API key de Brevo (ex-Sendinblue): empieza con "xkeysib-". Funciona por HTTPS,
// no bloqueado por Render. Se usa como FALLBACK si SendGrid falla (o como primario
// si SendGrid no está configurado).
const BREVO_KEY = process.env.BREVO_API_KEY
    || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('xkeysib-') ? process.env.SMTP_PASS : null);
const USE_BREVO_API = Boolean(BREVO_KEY);

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

// Construimos el transporter SMTP salvo que un proveedor HTTP (SendGrid/Brevo) sea
// el primario — igual queda disponible como último eslabón del fallback en local.
const HAS_HTTP_PROVIDER = USE_SENDGRID_API || USE_BREVO_API;
const transporter = HAS_HTTP_PROVIDER ? null : buildTransporter();

if (process.env.NODE_ENV !== 'test') {
    const order = [
        USE_SENDGRID_API ? 'SendGrid' : null,
        USE_BREVO_API ? 'Brevo' : null,
        transporter ? 'SMTP' : null,
    ].filter(Boolean).join(' → ') || 'SMTP/Gmail';
    console.log(`[email] cadena de envío: ${order} -> from=${fromRaw()}`);
    if (!HAS_HTTP_PROVIDER && transporter) {
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

// ── Envío vía API HTTP de Brevo (HTTPS, no bloqueado por Render) ──────────────
// Devuelve { ok, error }. Endpoint: POST https://api.brevo.com/v3/smtp/email
async function sendViaBrevoApi(recipients, subject, content, format) {
    const from = parseFrom();
    const payload = {
        sender: from.name ? { email: from.email, name: from.name } : { email: from.email },
        to: recipients.map((email) => ({ email })),
        subject,
    };
    if (format === 'html') {
        payload.htmlContent = content;
        payload.textContent = htmlToText(content);
    } else {
        payload.textContent = content;
    }

    console.log(`[email] enviando (Brevo API) -> to=${recipients.join(', ')} subject="${subject}" from=${from.email}`);
    try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': BREVO_KEY,
                'Content-Type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) { // 201 Created
            const data = await res.json().catch(() => ({}));
            console.log(`[email] ENVIADO ✔ (Brevo API) to=${recipients.join(', ')} status=${res.status} msgId=${data.messageId || '-'}`);
            return { ok: true };
        }
        const errBody = await res.text().catch(() => '');
        console.error(`[email] ERROR (Brevo API) status=${res.status} to=${recipients.join(', ')} body=${errBody}`);
        return { ok: false, error: `Brevo ${res.status}: ${errBody.slice(0, 200)}` };
    } catch (error) {
        const msg = error && error.message ? error.message : String(error);
        console.error(`[email] ERROR (Brevo API) to=${recipients.join(', ')}:`, msg);
        return { ok: false, error: `Brevo: ${msg}` };
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

// Lista de proveedores disponibles, en orden de preferencia: SendGrid → Brevo → SMTP.
// Cada uno se intenta sólo si está configurado; si uno falla, se pasa al siguiente.
function buildProviderChain() {
    const chain = [];
    if (USE_SENDGRID_API) {
        chain.push({ name: 'sendgrid', send: async (r, s, c, f) => {
            const ok = await sendViaSendGridApi(r, s, c, f);
            return ok ? { ok: true } : { ok: false, error: 'SendGrid: ver log [email] ERROR' };
        }});
    }
    if (USE_BREVO_API) {
        chain.push({ name: 'brevo', send: sendViaBrevoApi });
    }
    // SMTP/Gmail como último recurso (suele estar bloqueado en Render, pero útil en local).
    // Sólo si hay transporter construido (no se arma cuando un proveedor HTTP es primario).
    if (transporter) {
        chain.push({ name: 'smtp', send: async (r, s, c, f) => {
            const ok = await sendViaSmtp(r, s, c, f);
            return ok ? { ok: true } : { ok: false, error: 'SMTP: ver log [email] ERROR' };
        }});
    }
    return chain;
}

// Envío con detalle de intentos. Devuelve:
//   { ok, provider, attempts: [{ provider, ok, error, at }] }
// Prueba cada proveedor en orden hasta que uno tenga éxito (fallback automático).
async function sendEmailWithResult(to, subject, content, format = 'text') {
    const recipients = []
        .concat(to || [])
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim())
        .filter(Boolean);

    const attempts = [];
    if (recipients.length === 0) {
        console.warn('[email] sendEmail: sin destinatarios válidos, no se envía');
        return { ok: false, provider: null, attempts, error: 'sin destinatarios válidos' };
    }

    const chain = buildProviderChain();
    if (chain.length === 0) {
        console.warn('[email] sin proveedor de email configurado (SendGrid/Brevo/SMTP)');
        return { ok: false, provider: null, attempts, error: 'sin proveedor configurado' };
    }

    for (const provider of chain) {
        let result;
        try {
            result = await provider.send(recipients, subject, content, format);
        } catch (err) {
            result = { ok: false, error: `${provider.name}: ${err && err.message ? err.message : String(err)}` };
        }
        attempts.push({ provider: provider.name, ok: !!result.ok, error: result.ok ? null : (result.error || 'error desconocido'), at: new Date() });
        if (result.ok) {
            if (attempts.length > 1) {
                console.warn(`[email] enviado por FALLBACK '${provider.name}' tras fallar ${attempts.length - 1} proveedor(es)`);
            }
            return { ok: true, provider: provider.name, attempts };
        }
        console.warn(`[email] proveedor '${provider.name}' falló, probando siguiente...`);
    }

    return { ok: false, provider: null, attempts, error: attempts.map(a => a.error).filter(Boolean).join(' | ') };
}

// Wrapper retrocompatible: devuelve boolean como antes.
async function sendEmail(to, subject, content, format = 'text') {
    const res = await sendEmailWithResult(to, subject, content, format);
    return res.ok;
}

module.exports = { sendEmail, sendEmailWithResult };
