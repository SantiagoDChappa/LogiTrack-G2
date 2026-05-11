const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const RouteStop = sequelize.define('route_stop', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    routeId:            { type: DataTypes.INTEGER, allowNull: false, field: 'route_id' },
    sequence:           { type: DataTypes.INTEGER, allowNull: false },
    stopType:           { type: DataTypes.STRING(20), allowNull: false, field: 'stop_type' }, // 'pickup' | 'delivery'
    branchId:           { type: DataTypes.INTEGER, allowNull: true,  field: 'branch_id' },
    shipmentId:         { type: DataTypes.INTEGER, allowNull: true,  field: 'shipment_id' },
    lat:                { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    lng:                { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    distanceFromPrevKm: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'distance_from_prev_km' },
    completed:          { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    completedAt:        { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
}, { tableName: 'route_stop', timestamps: false });

module.exports = { RouteStop };
