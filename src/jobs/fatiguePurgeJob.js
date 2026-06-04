/* eslint-disable no-console */
// Ojo de Patrón — purga por retención (US-12). Ejecutable por cron:
//   node src/jobs/fatiguePurgeJob.js
require('dotenv').config();
const sequelize = require('../database/connection');
const fatigueSvc = require('../services/fatigue');
const cfgSvc = require('../services/fatigue/config');

async function run() {
    const cfg = await cfgSvc.getConfig(null);
    return fatigueSvc.purgeExpired(cfg.retentionDays);
}

module.exports = { run };

if (require.main === module) {
    run()
        .then(n => { console.log(`Purga de fatiga: ${n} registros eliminados/disociados.`); return sequelize.close(); })
        .catch(e => { console.error('Error en purga de fatiga:', e.message); process.exit(1); });
}
