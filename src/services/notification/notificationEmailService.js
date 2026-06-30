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

    // Envío INMEDIATO SIEMPRE (salvo en tests), por SendGrid, igual que el envío
    // directo del email de confirmación del portal. NO depende de ENABLE_EMAIL_JOBS
    // (solo controla el cron de respaldo) NI del kill-switch "Envío automático" (que
    // ahora solo frena el cron). Antes, con el kill-switch apagado, los avisos al
    // cliente (demora / paquete dañado / entrega fallida / cambio de estado de
    // incidencia) quedaban PENDING y NO llegaban; el confirm sí porque no pasa por
    // la cola. Ahora se comportan igual: ni bien ocurre el evento, sale el mail.
    if (process.env.NODE_ENV !== 'test') {
        // require local: evita ciclo de carga (emailProcessorJob -> emailSender -> ...).
        const emailJob = require('../../jobs/emailProcessorJob');
        Promise.resolve()
            .then(() => emailJob.processOneEmail(row))
            .catch((err) => console.error(
                `[email-immediate] fallo envío inmediato #${row.id}:`,
                err && err.message ? err.message : err));
    }
    return row;
};

module.exports = { queueEmail };