const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

// Procesa UN mail: lo reclama (UPDATE atómico PENDING->PROCESSING, evita doble
// envío entre el cron y el inmediato), lo manda y marca el resultado.
// Devuelve 'sent' | 'retried' | 'skipped'. Lo usan el batch (cron) y queueEmail.
async function processOneEmail(email) {
    const claimed = await NotificationEmail.claimEmailForProcessing(email.id);
    if (!claimed) {
        // Otro proceso (cron o inmediato) ya lo tomó.
        console.log(`[email-job] mail #${email.id} ya lo está procesando otro worker, se saltea`);
        return 'skipped';
    }
    try {
        const result = await emailSender.sendEmailWithResult(email.recipient, email.subject, email.body, email.format);
        // Registra en el historial cada intento de proveedor (SendGrid/Resend/SMTP).
        for (const att of (result.attempts || [])) {
            await NotificationEmail.logAttempt({
                emailId:  email.id,
                provider: att.provider,
                success:  att.ok,
                error:    att.error,
            }).catch(() => {});
        }
        if (result.ok) {
            await NotificationEmail.markAsSentWithProvider(email.id, result.provider);
            console.log(`[email-job] mail #${email.id} ENVIADO por ${result.provider}`);
            return 'sent';
        }
        await NotificationEmail.scheduleRetry(email.id, email.attempts, result.error || 'fallo de envío (ver log [email] ERROR)');
        console.warn(`[email-job] mail #${email.id} NO se envió, reprogramado (intentos=${email.attempts})`);
        return 'retried';
    } catch (error) {
        await NotificationEmail.logAttempt({ emailId: email.id, provider: null, success: false, error: error.message }).catch(() => {});
        await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
        console.error(`[email-job] mail #${email.id} EXCEPCIÓN, reprogramado:`, error.message);
        return 'retried';
    }
}

// Batch: la RED DE SEGURIDAD del cron. Barre PENDING (mails que el envío inmediato
// no alcanzó + reintentos por nextRetryAt). El envío al instante lo hace queueEmail.
async function processPendingEmails() {
    const emails = await NotificationEmail.findPending();
    // Resumen del lote (lo usa el botón manual de Ajustes para dar feedback).
    const summary = { total: emails.length, sent: 0, retried: 0, skipped: 0 };
    if (!emails.length) {
        console.log('[email-job] no hay mails pendientes en la cola');
        return summary;
    }
    console.log(`[email-job] procesando ${emails.length} mail(s) pendiente(s)`);

    for (const email of emails) {
        const outcome = await processOneEmail(email);
        if (outcome === 'sent') { summary.sent += 1; }
        else if (outcome === 'retried') { summary.retried += 1; }
        else { summary.skipped += 1; }
    }
    return summary;
};

module.exports = { processPendingEmails, processOneEmail };