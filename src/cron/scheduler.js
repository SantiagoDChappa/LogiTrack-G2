const cron = require('node-cron');
const emailProcessorJob = require('../jobs/emailProcessorJob');
const delayDetectionJob = require('../jobs/delayDetectionJob');
const fatigueRecheckEscalationJob = require('../jobs/fatigueRecheckEscalationJob');
const pendingPaymentCancellationJob = require('../jobs/pendingPaymentCancellationJob');

// Intervalos parametrizables por env (formato cron). Antes corrían cada 1 y 2 min
// y martillaban Neon (quemaban la cuota de egress). El envío de mails al instante
// ya lo hace queueEmail, así que el batch es solo RED DE SEGURIDAD (reintentos).
const MAIL_CRON    = process.env.EMAIL_JOB_CRON || '*/5 * * * *';
const FATIGUE_CRON = process.env.FATIGUE_ESCALATION_CRON || '*/5 * * * *';

// Valida la expresión cron del env; si es inválida cae al default y avisa.
function pickCron(expr, fallback, label) {
    if (cron.validate(expr)) { return expr; }
    console.warn(`[scheduler] cron inválido para ${label}: "${expr}" -> uso "${fallback}"`);
    return fallback;
}

function startSchedulers() {
    // No agendar bajo tests: los cron dejan handles abiertos y cuelgan Jest.
    if (process.env.NODE_ENV === 'test') { return; }

    const mailCron = pickCron(MAIL_CRON, '*/5 * * * *', 'mails');
    cron.schedule(mailCron, async () => {
        // Kill-switch: si el envío auto está apagado (bandeja Notificaciones), no procesa.
        if (!(await emailProcessorJob.isAutoSendEnabled())) {
            console.log('[scheduler] envío automático DESACTIVADO — se saltea el batch de mails');
            return;
        }
        const t0 = Date.now();
        try {
            await emailProcessorJob.processPendingEmails();
            console.log(`[scheduler] procesador de mails OK (${Date.now() - t0}ms)`);
        } catch (err) {
            console.error('[scheduler] procesador de mails FALLÓ:', err && err.message ? err.message : err);
        }
    });

    // Detección de demoras: se ejecuta una vez por día a las 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        await delayDetectionJob.processDelayedShipments();
    });

    // LGT-199 Esc.4 — escala re-chequeos de fatiga omitidos. El umbral se mide en
    // minutos; */5 alcanza (idempotente: no duplica avisos). Ajustable por env.
    const fatigueCron = pickCron(FATIGUE_CRON, '*/5 * * * *', 'fatiga');
    cron.schedule(fatigueCron, async () => {
        await fatigueRecheckEscalationJob.processOmittedRechecks();
    });

    // Cancela envíos "Pendiente de Pago" vencidos (umbral configurable en Ajustes,
    // default 48hs). Cada hora alcanza de sobra para ese plazo.
    cron.schedule('0 * * * *', async () => {
        await pendingPaymentCancellationJob.processPendingPaymentExpirations();
    });

    console.log(`[scheduler] activo — mails: "${mailCron}", fatiga: "${fatigueCron}"`);
}

module.exports = { startSchedulers };