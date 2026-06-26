/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Las tablas viven en el schema `logitrack`, que NO está en el search_path por defecto
// de la conexión. `sequelize.query` corre SQL crudo sin aplicar el `define.schema`, así
// que cualquier migración que referencie una tabla SIN calificar (ej: `"user"` en vez de
// `logitrack."user"`) rompe con `relation ... does not exist` (42P01). Para blindar toda
// la clase de bug, anteponemos el search_path a cada archivo: lo no calificado resuelve a
// `logitrack` y lo ya calificado (la mayoría) sigue funcionando igual. Va en el MISMO
// query que la migración para garantizar que aplica sobre la misma conexión del pool.
const SCHEMA_PREFIX = 'SET search_path TO logitrack, public;\n';

const runMigrations = async () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {return;}

    for (const file of files) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        await sequelize.query(SCHEMA_PREFIX + sql);
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
