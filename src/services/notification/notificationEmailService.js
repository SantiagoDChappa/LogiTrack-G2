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

    // Envío INMEDIATO siempre (salvo en tests), igual que el envío directo de la
    // página de prueba: NO depende de ENABLE_EMAIL_JOBS (ese flag solo controla el
    // cron de respaldo en app.js). Antes, sin el flag, los avisos al cliente
    // (demora / paquete dañado / entrega fallida / cambio de estado de incidencia)
    // quedaban PENDING y NO llegaban. Sigue respetando el kill-switch de auto-envío.
    if (process.env.NODE_ENV !== 'test') {
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