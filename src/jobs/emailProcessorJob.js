const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

async function processPendingEmails() {
    const emails = await NotificationEmail.findPending();
    console.log("----------------------------------")
    console.log("info del emails: ", emails);
    console.log("----------------------------------")
    for (const email of emails) {
        let errorMessage = 'Servidor no disponible';
        await NotificationEmail.scheduleRetry(email.id, email.attempts, errorMessage);
        continue;

        try {
            await emailSender.sendEmail(email.recipient, email.subject, email.body);

            await NotificationEmail.markAsSent(email.id);
        } catch (error) {

            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
        }
    };
};

module.exports = { processPendingEmails };