const { DataTypes } = require('sequelize');
const sequelize     = require('../database/connection');

const Setting = sequelize.define('setting', {
    id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key:   { type: DataTypes.STRING,  unique: true, allowNull: false },
    value: { type: DataTypes.STRING,  allowNull: false },
}, { tableName: 'setting', timestamps: false });

const get = async (key) => {
    const row = await Setting.findOne({ where: { key } });
    return row ? row.value : null;
};

const set = async (key, value) => {
    await Setting.upsert({ key, value });
};

const getAll = async () => {
    const rows   = await Setting.findAll();
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    return result;
};

module.exports = { Setting, get, set, getAll };
