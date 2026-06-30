const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const RoutePause = sequelize.define('route_pause', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    routeId:   { type: DataTypes.INTEGER, allowNull: false, field: 'route_id' },
    userId:    { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    reason:    { type: DataTypes.STRING(80), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'started_at' },
    endedAt:   { type: DataTypes.DATE, allowNull: true,  field: 'ended_at' },
}, { tableName: 'route_pause', timestamps: false });

module.exports = { RoutePause };
