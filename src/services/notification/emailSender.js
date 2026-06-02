const nodemailer = require('nodemailer');
const settingModel = require('../../models/setting');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

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

// `format` opcional: 'html' envía cuerpo HTML (con fallback de texto); cualquier otro valor = texto plano.
async function sendEmail(to, subject, content, format = 'text') {
    try {
        const override = (await settingModel.get('test_email_override')) || '';
        const useOverride = isValidEmail(override);

        const recipients = []
            .concat(to || [])
            .flatMap(v => String(v).split(','))
            .map(v => v.trim())
            .filter(isValidEmail);

        const finalTo = useOverride ? override.trim() : recipients.join(', ');
        if (!finalTo) {
            console.warn('sendEmail: sin destinatarios válidos, no se envía');
            return;
        }

        const finalSubject = useOverride
            ? `[TEST → ${recipients.join(', ') || 'sin destinatarios'}] ${subject}`
            : subject;

        const message = {
            from: process.env.EMAIL_USER,
            to:   finalTo,
            subject: finalSubject,
        };
        if (format === 'html') {
            message.html = content;
            message.text = htmlToText(content);
        } else {
            message.text = content;
        }

        await transporter.sendMail(message);
    }
    catch (error) {
        console.error('Error sending email:', error);
    }
}

module.exports = { sendEmail };
