const { NotificationEmail } = require('../../models/notificationEmail');

async function queueEmail(data) {
    return NotificationEmail.create({
        recipient: data.recipient,
        subject: data.subject,
        body: data.body,
        attempts: 0,
        status: 'PENDING'
    });
};

module.exports = { queueEmail };