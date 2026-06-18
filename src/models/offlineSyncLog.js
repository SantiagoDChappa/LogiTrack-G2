const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// #4 Modo offline — registro de idempotencia de acciones sincronizadas.
const OfflineSyncLog = sequelize.define('offline_sync_log', {
    id:             { type: DataTypes.INTEGER,    primaryKey: true, autoIncrement: true },
    clientActionId: { type: DataTypes.STRING(80), allowNull: false, unique: true, field: 'client_action_id' },
    userId:         { type: DataTypes.INTEGER,    allowNull: true,  field: 'user_id' },
    actionType:     { type: DataTypes.STRING(20), allowNull: true,  field: 'action_type' },
    createdAt:      { type: DataTypes.DATE,       allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'offline_sync_log', timestamps: false });

const exists = async (clientActionId) =>
    !!(await OfflineSyncLog.findOne({ where: { clientActionId } }));

const create = ({ clientActionId, userId, actionType }) =>
    OfflineSyncLog.create({ clientActionId, userId: userId || null, actionType: actionType || null });

module.exports = { OfflineSyncLog, exists, create };
