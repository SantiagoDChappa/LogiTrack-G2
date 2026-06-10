const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón — contador agregado de bloqueos por transportista (US-8).
// Sobrevive a la purga de datos personales (US-12): es dato disociado.
const FatiguePatternCounter = sequelize.define('fatigue_pattern_counter', {
    userId:       { type: DataTypes.INTEGER, primaryKey: true, field: 'user_id' },
    blockedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'blocked_count' },
    lastEventAt:  { type: DataTypes.DATE, allowNull: true, field: 'last_event_at' },
    // LGT-197: datos de la detección del patrón recurrente.
    recurrentMarkedAt:   { type: DataTypes.DATE,    allowNull: true, field: 'recurrent_marked_at' },
    recurrentEvents:     { type: DataTypes.INTEGER, allowNull: true, field: 'recurrent_events' },
    recurrentWindowDays: { type: DataTypes.INTEGER, allowNull: true, field: 'recurrent_window_days' },
    recurrentNotifiedAt: { type: DataTypes.DATE,    allowNull: true, field: 'recurrent_notified_at' },
    // LGT-197: revisión por el Supervisor.
    reviewStatus: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'NONE', field: 'review_status' },
    reviewedBy:   { type: DataTypes.INTEGER, allowNull: true, field: 'reviewed_by' },
    reviewedAt:   { type: DataTypes.DATE,    allowNull: true, field: 'reviewed_at' },
    reviewNote:   { type: DataTypes.TEXT,    allowNull: true, field: 'review_note' },
}, { tableName: 'fatigue_pattern_counter', timestamps: false });

module.exports = { FatiguePatternCounter };
