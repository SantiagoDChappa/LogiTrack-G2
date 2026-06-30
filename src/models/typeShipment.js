const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const TypeShipment = sequelize.define('shipmentType', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'shipmentType', timestamps: false });

const { withTtl } = require('../utils/memoryCache');

// Tipos de envío: catálogo fijo. TTL 1h.
const getAll = withTtl(60 * 60 * 1000, () => TypeShipment.findAll({ order: [['id', 'ASC']] }), 'typeShipment:all');

module.exports = { TypeShipment, getAll };
