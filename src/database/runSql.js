/* eslint-disable no-console */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const [,, filePath] = process.argv;
if (!filePath) {
    console.error('Uso: node src/database/runSql.js <ruta/al/archivo.sql>');
    process.exit(1);
}

const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) {
    console.error(`Archivo no encontrado: ${absPath}`);
    process.exit(1);
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: process.env.NODE_ENV === 'production'
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
});

(async () => {
    try {
        await sequelize.authenticate();
        const sql = fs.readFileSync(absPath, 'utf8');
        await sequelize.query(sql);
        console.log(`✓ ${path.basename(absPath)}`);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
