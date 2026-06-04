const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

async function processPendingEmails() {
    const emails = await NotificationEmail.findPending();

    for (const email of emails) {
        const claimed = await NotificationEmail.claimEmailForProcessing(email.id);

        if (!claimed) {
            continue; // Otro proceso ya lo está manejando
        }
        try {
            await emailSender.sendEmail(email.recipient, email.subject, email.body, email.format);
            await NotificationEmail.markAsSent(email.id);
        } catch (error) {
            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
        }
    }
};

module.exports = { processPendingEmails };