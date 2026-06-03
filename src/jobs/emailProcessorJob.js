const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

async function processPendingEmails() {
    const emails = await NotificationEmail.findPending();
    console.log("----------------------------------")
    console.log("info del emails: ", emails);
    console.log("----------------------------------")
    for (const email of emails) {
        try {
            const ok = await emailSender.sendEmail(email.recipient, email.subject, email.body, email.format);
            if (ok) {
                await NotificationEmail.markAsSent(email.id);
            } else {
                // sendEmail captura sus errores y devuelve false: reintentar en vez de marcar SENT.
                await NotificationEmail.scheduleRetry(email.id, email.attempts, 'sendEmail devolvió false (sin destinatarios válidos o fallo de envío)');
            }
        } catch (error) {
            console.error('emailProcessorJob send error:', error.message);
            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
        }
    }
};

module.exports = { processPendingEmails };