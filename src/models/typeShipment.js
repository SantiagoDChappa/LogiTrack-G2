const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const TypeShipment = sequelize.define('shipmentType', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'shipmentType', timestamps: false });

const getAll = () => {
    return TypeShipment.findAll({ order: [['id', 'ASC']] });
};

module.exports = { TypeShipment, getAll };
