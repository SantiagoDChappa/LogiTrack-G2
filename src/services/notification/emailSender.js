const nodemailer = require('nodemailer');
require('dotenv').config();

// Transporter configurable por entorno: sirve cualquier proveedor SMTP
// (SendGrid, Brevo, Mailgun, Amazon SES, etc.). Si se define SMTP_HOST se usa
// SMTP genérico; si no, se cae al servicio Gmail (modo desarrollo).
// En Render configurar las variables SMTP_* del proveedor transaccional, ya que
// el plan free bloquea Gmail/puertos SMTP salientes hacia hosts arbitrarios.
function buildTransporter() {
    if (process.env.SMTP_HOST) {
        const port = Number(process.env.SMTP_PORT) || 587;
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            // 465 = SSL implícito; 587/2525 = STARTTLS. Override con SMTP_SECURE=true/false.
            secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
            auth: {
                user: process.env.SMTP_USER || process.env.EMAIL_USER,
                pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
            },
        });
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

const transporter = buildTransporter();

// Remitente: EMAIL_FROM permite un From con nombre (ej: "LogiTrack <no-reply@dominio.com>").
// Fallback al usuario SMTP/Gmail.
const fromAddress = () =>
    process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Quita etiquetas HTML para generar un fallback de texto plano.
const htmlToText = (html) => String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
/*
// `format` opcional: 'html' envía cuerpo HTML (con fallback de texto); cualquier otro valor = texto plano.
// `opts.allowOverride` (default false): solo los envíos de PRUEBA aplican el redirect
// `test_email_override`. Las notificaciones reales (destinatario/remitente/parametrizado)
// NUNCA se redirigen: van siempre al destinatario configurado.
async function sendEmail(to, subject, content, format = 'text', opts = {}) {
    try {
        const allowOverride = opts.allowOverride === true;
        const override = allowOverride ? ((await settingModel.get('test_email_override')) || '') : '';
        const useOverride = allowOverride && isValidEmail(override);

        const recipients = []
            .concat(to || [])
            .flatMap(v => String(v).split(','))
            .map(v => v.trim())
            .filter(isValidEmail);

        const finalTo = useOverride ? override.trim() : recipients.join(', ');
        if (!finalTo) {
            console.warn('sendEmail: sin destinatarios válidos, no se envía');
            return false;
        }

        const finalSubject = useOverride
            ? `[TEST → ${recipients.join(', ') || 'sin destinatarios'}] ${subject}`
            : subject;

        const message = {
            from: process.env.EMAIL_USER,
            to: finalTo,
            subject: finalSubject,
        };
        if (format === 'html') {
            message.html = content;
            message.text = htmlToText(content);
        } else {
            message.text = content;
        }

        await transporter.sendMail(message);
        return true;
    }
    catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}*/

async function sendEmail(to, subject, content, format = 'text') {
    const recipients = []
        .concat(to || [])
        .flatMap(v => String(v).split(','))
        .map(v => v.trim());
    if (recipients.length === 0) {
        throw new Error('No valid recipients provided');
        return;
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

    try {
        await transporter.sendMail(data);
        return true;
    } catch (error) {
        console.error('sendEmail:', error.message);
        return false;
    }
}

module.exports = { sendEmail };
