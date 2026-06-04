const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón — parámetros configurables (US-7). branchId NULL = valor global.
const FatigueConfig = sequelize.define('fatigue_config', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    branchId:  { type: DataTypes.INTEGER, allowNull: true,  field: 'branch_id' },
    param:     { type: DataTypes.STRING(40), allowNull: false },
    value:     { type: DataTypes.STRING(40), allowNull: false },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'updated_by' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
}, { tableName: 'fatigue_config', timestamps: false });

module.exports = { FatigueConfig };
