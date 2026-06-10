const cron = require('node-cron');
const emailProcessorJob = require('../jobs/emailProcessorJob');
const delayDetectionJob = require('../jobs/delayDetectionJob');
const fatigueRecheckEscalationJob = require('../jobs/fatigueRecheckEscalationJob');

function startSchedulers() {
    // No agendar bajo tests: los cron dejan handles abiertos y cuelgan Jest.
    if (process.env.NODE_ENV === 'test') { return; }

    cron.schedule('* * * * *', async () => {
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

    // LGT-199 Esc.4 — escala re-chequeos de fatiga omitidos. Cada 2 min: el umbral
    // se mide en minutos, no hace falta más fino. Idempotente (no duplica avisos).
    cron.schedule('*/2 * * * *', async () => {
        await fatigueRecheckEscalationJob.processOmittedRechecks();
    });
}

module.exports = { startSchedulers };