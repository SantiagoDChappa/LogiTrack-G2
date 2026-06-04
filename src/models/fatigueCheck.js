const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón — registro de chequeos de fatiga del transportista.
// Ley 25.326: NO almacena el dato biométrico crudo; solo score + metadata.
const FatigueCheck = sequelize.define('fatigue_check', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:         { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    routeId:        { type: DataTypes.INTEGER, allowNull: true,  field: 'route_id' },
    branchId:       { type: DataTypes.INTEGER, allowNull: true,  field: 'branch_id' },
    triggerType:    { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INICIO', field: 'trigger_type' },
    method:         { type: DataTypes.STRING(12), allowNull: true },
    consentStatus:  { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDING', field: 'consent_status' },
    consentVersion: { type: DataTypes.STRING(20), allowNull: true, field: 'consent_version' },
    consentAt:      { type: DataTypes.DATE,       allowNull: true, field: 'consent_at' },
    score:          { type: DataTypes.SMALLINT,   allowNull: true },
    threshold:      { type: DataTypes.SMALLINT,   allowNull: true },
    decision:       { type: DataTypes.STRING(12), allowNull: true },
    releasedBy:     { type: DataTypes.INTEGER,    allowNull: true, field: 'released_by' },
    releaseReason:  { type: DataTypes.STRING(60), allowNull: true, field: 'release_reason' },
    releaseDetail:  { type: DataTypes.TEXT,       allowNull: true, field: 'release_detail' },
    releasedAt:     { type: DataTypes.DATE,       allowNull: true, field: 'released_at' },
    createdAt:      { type: DataTypes.DATE,       allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'fatigue_check', timestamps: false });

const FatigueTrigger  = Object.freeze({ INICIO: 'INICIO', EN_RUTA: 'EN_RUTA' });
const FatigueMethod   = Object.freeze({ VOZ: 'VOZ', REACCION: 'REACCION' });
const ConsentStatus   = Object.freeze({ PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' });
const FatigueDecision = Object.freeze({ APTO: 'APTO', BLOCKED: 'BLOCKED' });

module.exports = { FatigueCheck, FatigueTrigger, FatigueMethod, ConsentStatus, FatigueDecision };
