const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón — contador agregado de bloqueos por transportista (US-8).
// Sobrevive a la purga de datos personales (US-12): es dato disociado.
const FatiguePatternCounter = sequelize.define('fatigue_pattern_counter', {
    userId:       { type: DataTypes.INTEGER, primaryKey: true, field: 'user_id' },
    blockedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'blocked_count' },
    lastEventAt:  { type: DataTypes.DATE, allowNull: true, field: 'last_event_at' },
}, { tableName: 'fatigue_pattern_counter', timestamps: false });

module.exports = { FatiguePatternCounter };
