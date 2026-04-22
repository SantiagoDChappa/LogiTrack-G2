require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: process.env.NODE_ENV === 'production'
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
});

const runFile = async (filePath) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    await sequelize.query(sql);
    console.log(`✓ ${path.basename(filePath)}`);
};

const setup = async () => {
    try {
        console.log('Conectando a la base de datos...');
        await sequelize.authenticate();
        console.log('Conexión exitosa.\n');

        console.log('Ejecutando schema...');
        await runFile(path.join(__dirname, 'schema.sql'));

        console.log('Cargando datos iniciales...');
        await runFile(path.join(__dirname, 'seed.sql'));

        console.log('\nBase de datos lista.');
    } catch (err) {
        console.error('Error en el setup:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
};

setup();
