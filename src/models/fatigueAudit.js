const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón — auditoría de accesos/acciones (US-14) y log de purga (US-12).
const FatigueAudit = sequelize.define('fatigue_audit', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    actorId:   { type: DataTypes.INTEGER, allowNull: true, field: 'actor_id' },
    action:    { type: DataTypes.STRING(40), allowNull: false },
    checkId:   { type: DataTypes.INTEGER, allowNull: true, field: 'check_id' },
    detail:    { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'fatigue_audit', timestamps: false });

module.exports = { FatigueAudit };
