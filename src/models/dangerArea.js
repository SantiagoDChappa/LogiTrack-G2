const { DataTypes } = require('sequelize');
const sequelize     = require('../database/connection');

// Área peligrosa / no llegable. Ver migración 088_danger_area.sql.
const DangerArea = sequelize.define('danger_area', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scope:     { type: DataTypes.STRING,  allowNull: false, defaultValue: 'POLYGON' },
    code:      { type: DataTypes.STRING,  allowNull: true },
    name:      { type: DataTypes.STRING,  allowNull: false },
    reachable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    geom:      { type: DataTypes.JSONB,   allowNull: true },
    note:      { type: DataTypes.TEXT,    allowNull: true },
    createdAt: { type: DataTypes.DATE,    allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'danger_area', timestamps: false });

module.exports = DangerArea;
module.exports.DangerArea = DangerArea;
