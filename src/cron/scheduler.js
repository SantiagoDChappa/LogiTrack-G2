const cron = require('node-cron');
const emailProcessorJob = require('../jobs/emailProcessorJob');
const delayDetectionJob = require('../jobs/delayDetectionJob');

function startSchedulers() {
    // No agendar bajo tests: los cron dejan handles abiertos y cuelgan Jest.
    if (process.env.NODE_ENV === 'test') { return; }

    cron.schedule('* * * * *', async () => {
        await emailProcessorJob.processPendingEmails();
        console.log("Se ejecuto el schedule");
    });

    // Detección de demoras: se ejecuta una vez por día a las 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        await delayDetectionJob.processDelayedShipments();
    });
}

module.exports = { startSchedulers };