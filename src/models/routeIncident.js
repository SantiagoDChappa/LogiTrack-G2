const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const RouteIncident = sequelize.define('route_incident', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    routeId:      { type: DataTypes.INTEGER, allowNull: false, field: 'route_id' },
    userId:       { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    incidentType: { type: DataTypes.STRING(40), allowNull: false, field: 'incident_type' },
    severity:     { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'media' },
    description:  { type: DataTypes.TEXT,       allowNull: true },
    latitude:     { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude:    { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    reportedAt:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'reported_at' },
    resolvedAt:   { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
}, { tableName: 'route_incident', timestamps: false });

module.exports = { RouteIncident };
