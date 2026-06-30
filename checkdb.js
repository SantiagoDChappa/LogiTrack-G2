/* eslint-disable no-console */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const s = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});
s.query('SELECT column_name FROM information_schema.columns WHERE table_schema = \'logitrack\' AND table_name = \'shipment\'')
 .then(r => console.log(r[0]))
 .catch(e => console.log(e.message))
 .finally(() => s.close());