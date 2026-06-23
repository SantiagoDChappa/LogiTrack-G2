const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Zone = sequelize.define('zone', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:               { type: DataTypes.STRING(150), allowNull: false },
    provinceId:         { type: DataTypes.INTEGER, allowNull: true, field: 'province_id' },
    baseCost:           { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'base_cost' },
    surchargePerKg:     { type: DataTypes.DECIMAL(8, 2),  allowNull: false, defaultValue: 0, field: 'surcharge_per_kg' },
    surchargePerM3:     { type: DataTypes.DECIMAL(8, 2),  allowNull: false, defaultValue: 0, field: 'surcharge_per_m3' },
    postalCodePrefixes: { type: DataTypes.JSONB, allowNull: true, field: 'postal_code_prefixes' },
    departamentoIds:    { type: DataTypes.JSONB, allowNull: true, field: 'departamento_ids' },
    enabled:            { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'zone', timestamps: false });

const getAll  = ()   => Zone.findAll({ order: [['name', 'ASC']] });
const getById = (id) => Zone.findByPk(id);
const getEnabled = () => Zone.findAll({ where: { enabled: true }, order: [['name', 'ASC']] });

module.exports = { Zone, getAll, getById, getEnabled };
