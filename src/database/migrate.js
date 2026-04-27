/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const runMigrations = async () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {return;}

    for (const file of files) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        await sequelize.query(sql);
        console.log(`OK ${file}`);
    }
};

module.exports = { runMigrations };

// Permite ejecutar el archivo directamente: `node src/database/migrate.js`
if (require.main === module) {
    (async () => {
        try {
            await sequelize.authenticate();
            await runMigrations();
            console.log('Migraciones aplicadas.');
        } catch (err) {
            console.error('Error al migrar:', err.message);
            process.exit(1);
        } finally {
            await sequelize.close();
        }
    })();
}
