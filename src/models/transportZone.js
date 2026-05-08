const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const TransportZone = sequelize.define('transport_zone', {
    transportId: { type: DataTypes.INTEGER, primaryKey: true, field: 'transport_id' },
    zoneId:      { type: DataTypes.INTEGER, primaryKey: true, field: 'zone_id' },
}, { tableName: 'transport_zone', timestamps: false });

module.exports = { TransportZone };
