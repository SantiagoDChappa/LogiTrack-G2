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

async function sendEmail(to, subject, text) {
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

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to:   finalTo,
            subject: finalSubject,
            text,
        });
    }
    catch (error) {
        console.error('Error sending email:', error);
    }
}

module.exports = { sendEmail };
