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
            const ok = await emailSender.sendEmail(email.recipient, email.subject, email.body, email.format);
            if (ok) {
                await NotificationEmail.markAsSent(email.id);
                summary.sent += 1;
                console.log(`[email-job] mail #${email.id} marcado como ENVIADO`);
            } else {
                // sendEmail devolvió false (error SMTP ya logueado): reintentar luego.
                await NotificationEmail.scheduleRetry(email.id, email.attempts, 'sendEmail devolvió false (ver log [email] ERROR)');
                summary.retried += 1;
                console.warn(`[email-job] mail #${email.id} NO se envió, reprogramado para reintento (intentos=${email.attempts})`);
            }
        } catch (error) {
            await NotificationEmail.scheduleRetry(email.id, email.attempts, error.message);
            summary.retried += 1;
            console.error(`[email-job] mail #${email.id} EXCEPCIÓN, reprogramado:`, error.message);
        }
    }
    return summary;
};

module.exports = { processPendingEmails };