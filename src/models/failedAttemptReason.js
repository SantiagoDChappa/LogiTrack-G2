// Sprint 3 - 2.5: motivos de intento fallido configurables desde ajustes
const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const FailedAttemptReason = sequelize.define('failedAttemptReason', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code:      { type: DataTypes.STRING(40),  allowNull: false, unique: true },
    label:     { type: DataTypes.STRING(120), allowNull: false },
    active:    { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
    retryDays: { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 1, field: 'retry_days' },
    maxAttemptsOverride: { type: DataTypes.INTEGER, allowNull: true, field: 'max_attempts_override' },
    createsIncident:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'creates_incident' },
}, { tableName: 'failed_attempt_reason', timestamps: false });

const getActive = () => FailedAttemptReason.findAll({ where: { active: true }, order: [['label', 'ASC']] });
const getAll    = () => FailedAttemptReason.findAll({ order: [['active', 'DESC'], ['label', 'ASC']] });
const getByCode = (code) => FailedAttemptReason.findOne({ where: { code } });

module.exports = { FailedAttemptReason, getActive, getAll, getByCode };
