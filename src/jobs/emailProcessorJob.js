const NotificationEmail = require('../models/notificationEmail');
const emailSender = require('../services/notification/emailSender');

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
        const claimed = await NotificationEmail.claimEmailForProcessing(email.id);

        if (!claimed) {
            summary.skipped += 1;
            console.log(`[email-job] mail #${email.id} ya lo está procesando otro worker, se saltea`);
            continue; // Otro proceso ya lo está manejando
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
                summary.sent += 1;
                console.log(`[email-job] mail #${email.id} ENVIADO por ${result.provider}`);
            } else {
                await NotificationEmail.scheduleRetry(email.id, email.attempts, result.error || 'fallo de envío (ver log [email] ERROR)');
                summary.retried += 1;
                console.warn(`[email-job] mail #${email.id} NO se envió, reprogramado (intentos=${email.attempts})`);
            }
        } catch (error) {
            await NotificationEmail.logAttempt({ emailId: email.id, provider: null, success: false, error: error.message }).catch(() => {});
            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
            summary.retried += 1;
            console.error(`[email-job] mail #${email.id} EXCEPCIÓN, reprogramado:`, error.message);
        }
    }
    return summary;
};

module.exports = { processPendingEmails };