/* eslint-disable no-console */
// Corre el seed de partidos por zona (capa visual del mapa). Idempotente.
//   node src/database/seed-zone-departamentos.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('./connection');

(async () => {
    try {
        await sequelize.authenticate();
        const sql = fs.readFileSync(path.join(__dirname, 'seed_zone_departamentos.sql'), 'utf8');
        await sequelize.query(sql);
        const rows = await sequelize.query(
            `SELECT id, name, jsonb_array_length(departamento_ids) AS partidos
             FROM logitrack.zone
             WHERE departamento_ids IS NOT NULL
             ORDER BY name`,
            { type: sequelize.QueryTypes.SELECT }
        );
        console.log('Zonas con partidos asignados:');
        rows.forEach(r => console.log(`  ${r.name}: ${r.partidos} partido(s)`));
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
