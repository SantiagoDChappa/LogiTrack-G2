const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

async function processPendingEmails() {
    const emails = await NotificationEmail.findPending();
    console.log("----------------------------------")
    console.log("info del emails: ", emails);
    console.log("----------------------------------")
    for (const email of emails) {
        try {
            await emailSender.sendEmail(email.recipient, email.subject, email.body);
            await NotificationEmail.markAsSent(email.id);
        } catch (error) {
            console.error('emailProcessorJob send error:', error.message);
            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
        }
    }
};

module.exports = { processPendingEmails };