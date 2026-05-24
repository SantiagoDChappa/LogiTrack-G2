const cron = require('node-cron');
const emailProcessorJob = require('../jobs/emailProcessorJob')

function startSchedulers() {
    
    cron.schedule('* * * * *', async () => {
        await emailProcessorJob.processPendingEmails();
        console.log("Se ejecuto el schedule");
    });
}

module.exports = { startSchedulers };