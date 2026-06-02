const { NotificationEmail } = require('../../models/notificationEmail');

async function queueEmail(data) {
    return NotificationEmail.create({
        recipient: data.recipient,
        subject: data.subject,
        body: data.body,
        format: data.format === 'html' ? 'html' : 'text',
        attempts: 0,
        status: 'PENDING'
    });
};

module.exports = { queueEmail };