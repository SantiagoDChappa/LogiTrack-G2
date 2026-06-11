const { NotificationEmail } = require('../../models/notificationEmail');

// Encola un mail (fila PENDING) y, si los jobs de email están activos, dispara un
// envío INMEDIATO en background: el destinatario lo recibe al instante sin esperar
// el tick del cron. No se hace await -> no agrega latencia al request. El cron queda
// como red de seguridad (reintentos + lo que el inmediato no alcance).
async function queueEmail(data) {
    const row = await NotificationEmail.create({
        recipient: data.recipient,
        subject: data.subject,
        body: data.body,
        format: data.format === 'html' ? 'html' : 'text',
        attempts: 0,
        status: 'PENDING'
    });

    if (process.env.ENABLE_EMAIL_JOBS === 'true' && process.env.NODE_ENV !== 'test') {
        // require local: evita ciclo de carga (emailProcessorJob -> emailSender -> ...).
        const emailJob = require('../../jobs/emailProcessorJob');
        // Respeta el kill-switch: si el envío auto está apagado, el mail queda PENDING
        // y se manda luego con el botón manual de la bandeja.
        if (await emailJob.isAutoSendEnabled()) {
            Promise.resolve()
                .then(() => emailJob.processOneEmail(row))
                .catch((err) => console.error(
                    `[email-immediate] fallo envío inmediato #${row.id}:`,
                    err && err.message ? err.message : err));
        }
    }
    return row;
};

module.exports = { queueEmail };