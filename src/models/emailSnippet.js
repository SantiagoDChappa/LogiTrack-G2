const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const EmailSnippet = sequelize.define('email_snippet', {
    id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key:     { type: DataTypes.STRING(60),  allowNull: false, unique: true },
    label:   { type: DataTypes.STRING(120), allowNull: false },
    icon:    { type: DataTypes.STRING(40),  allowNull: true },
    html:    { type: DataTypes.TEXT,        allowNull: false, defaultValue: '' },
    text:    { type: DataTypes.TEXT,        allowNull: false, defaultValue: '' },
    builtin: { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false }
}, { tableName: 'email_snippet', timestamps: false });

const getAll = () => EmailSnippet.findAll({ order: [['builtin', 'DESC'], ['label', 'ASC']] });

const getById = (id) => EmailSnippet.findOne({ where: { id } });

module.exports = { EmailSnippet, getAll, getById };
