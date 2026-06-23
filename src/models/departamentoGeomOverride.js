const { DataTypes } = require('sequelize');
const sequelize     = require('../database/connection');

// Override estético de la delimitación de un partido. Ver migración
// 091_departamento_geom_override.sql. No afecta costeo ni zonas, solo el mapa.
const DepartamentoGeomOverride = sequelize.define('departamento_geom_override', {
    code:      { type: DataTypes.STRING, primaryKey: true },
    geom:      { type: DataTypes.JSONB,  allowNull: false },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true,  field: 'updated_by' },
    updatedAt: { type: DataTypes.DATE,    allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
}, { tableName: 'departamento_geom_override', timestamps: false });

module.exports = DepartamentoGeomOverride;
module.exports.DepartamentoGeomOverride = DepartamentoGeomOverride;
