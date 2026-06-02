const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const NotificationVariable = sequelize.define('notification_variable', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key:         { type: DataTypes.STRING(60),  allowNull: false, unique: true },
    label:       { type: DataTypes.STRING(120), allowNull: false },
    value:       { type: DataTypes.TEXT,        allowNull: false, defaultValue: '' },
    description: { type: DataTypes.STRING(200), allowNull: true }
}, { tableName: 'notification_variable', timestamps: false });

const getAll = () => NotificationVariable.findAll({ order: [['label', 'ASC']] });

// { key: value } para inyectar en el render.
const getAllAsMap = async () => {
    const rows = await NotificationVariable.findAll();
    const map = {};
    for (const r of rows) { map[r.key] = r.value; }
    return map;
};

const getById = (id) => NotificationVariable.findOne({ where: { id } });

module.exports = { NotificationVariable, getAll, getAllAsMap, getById };
