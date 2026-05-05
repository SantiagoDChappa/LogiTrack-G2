const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Branch = sequelize.define('branch', {
    id:         { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
    name:       { type: DataTypes.STRING(150), allowNull: false },
    provinceId: { type: DataTypes.INTEGER,     allowNull: false, field: 'province_id' },
    latitude:   { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    longitude:  { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    address:    { type: DataTypes.STRING(255), allowNull: false },
    postalCode: { type: DataTypes.STRING(10),  allowNull: false, field: 'postal_code' },
    phone:      { type: DataTypes.STRING(20),  allowNull: true  },
    statusId:   { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 1, field: 'status_id' },
}, { tableName: 'branch', timestamps: false });

const getAll  = ()   => Branch.findAll({ order: [['name', 'ASC']] });
const getById = (id) => Branch.findByPk(id);

module.exports = { Branch, getAll, getById };
