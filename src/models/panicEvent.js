const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const PanicEvent = sequelize.define('panic_event', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:     { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    routeId:    { type: DataTypes.INTEGER, allowNull: true,  field: 'route_id' },
    latitude:   { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude:  { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    message:    { type: DataTypes.TEXT, allowNull: true },
    createdAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    resolvedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'resolved_by' },
}, { tableName: 'panic_event', timestamps: false });

module.exports = { PanicEvent };
