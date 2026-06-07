const nodemailer = require('nodemailer');
require('dotenv').config();

// Transporter configurable por entorno: sirve cualquier proveedor SMTP
// (SendGrid, Brevo, Mailgun, Amazon SES, etc.). Si se define SMTP_HOST se usa
// SMTP genérico; si no, se cae al servicio Gmail (modo desarrollo).
// En Render configurar las variables SMTP_* del proveedor transaccional, ya que
// el plan free bloquea Gmail/puertos SMTP salientes hacia hosts arbitrarios.
// Timeouts: si el SMTP no responde (ej: Render free bloquea el puerto saliente)
// preferimos fallar rápido en vez de dejar la request/job colgada "cargando".
const SMTP_TIMEOUTS = {
    connectionTimeout: 10000, // 10s para abrir la conexión TCP
    greetingTimeout:   10000, // 10s para el saludo del servidor
    socketTimeout:     20000, // 20s de inactividad del socket
};

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
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        ...SMTP_TIMEOUTS,
    });
}

const transporter = buildTransporter();

// Verificación de conexión al arrancar (no en tests). Loguea si el SMTP responde
// o el motivo exacto del fallo, para diagnosticar problemas de envío.
if (process.env.NODE_ENV !== 'test') {
    transporter.verify()
        .then(() => console.log('[email] conexión SMTP verificada: el servidor acepta mensajes ✔'))
        .catch((err) => console.error('[email] FALLO al verificar SMTP:', err && err.message ? err.message : err));
}

// Remitente: EMAIL_FROM permite un From con nombre (ej: "LogiTrack <no-reply@dominio.com>").
// Fallback al usuario SMTP/Gmail.
const fromAddress = () =>
    process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

// Quita etiquetas HTML para generar un fallback de texto plano.
const htmlToText = (html) => String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
async function sendEmail(to, subject, content, format = 'text') {
    const recipients = []
        .concat(to || [])
        .flatMap(v => String(v).split(','))
        .map(v => v.trim())
        .filter(Boolean);
    if (recipients.length === 0) {
        console.warn('[email] sendEmail: sin destinatarios válidos, no se envía');
        return false;
    }

    const data = {
        from: fromAddress(),
        to: recipients.join(', '),
        subject,
    };
    if (format === 'html') {
        data.html = content;
        data.text = htmlToText(content); // fallback texto plano
    } else {
        data.text = content;
    }

    console.log(`[email] enviando -> to=${data.to} subject="${subject}" from=${data.from} format=${format}`);
    try {
        const info = await transporter.sendMail(data);
        console.log(`[email] ENVIADO ✔ to=${data.to} messageId=${info.messageId || '-'} response=${info.response || '-'}`);
        return true;
    } catch (error) {
        // Log completo: código + comando + respuesta del servidor ayudan a ubicar el error.
        console.error(`[email] ERROR enviando a ${data.to}:`, {
            message: error.message,
            code:    error.code,
            command: error.command,
            response: error.response,
        });
        return false;
    }
}

module.exports = { sendEmail };
