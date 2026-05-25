// Sprint 3 - 2.5: textos / mensajes estándar editables desde ajustes
const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const StandardMessage = sequelize.define('standardMessage', {
    id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code:  { type: DataTypes.STRING(40),  allowNull: false, unique: true },
    label: { type: DataTypes.STRING(120), allowNull: false },
    body:  { type: DataTypes.TEXT,        allowNull: false },
}, { tableName: 'standard_message', timestamps: false });

const getAll      = () => StandardMessage.findAll({ order: [['label', 'ASC']] });
const getByCode   = (code) => StandardMessage.findOne({ where: { code } });
const updateByCode = async (code, body) => {
    const row = await StandardMessage.findOne({ where: { code } });
    if (!row) { return null; }
    row.body = body;
    await row.save();
    return row;
};

// Render con placeholders simples {{key}}
const render = (body, vars = {}) => {
    if (!body) { return ''; }
    return String(body).replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
};

module.exports = { StandardMessage, getAll, getByCode, updateByCode, render };
