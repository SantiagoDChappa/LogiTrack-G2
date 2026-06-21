const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const BlockedIp = sequelize.define('blockedIp', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ip:           { type: DataTypes.STRING(45), allowNull: false, unique: true },
    reason:       { type: DataTypes.TEXT, allowNull: true },
    blockedUntil: { type: DataTypes.DATE, allowNull: false, field: 'blocked_until' },
    createdAt:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'blocked_ip', schema: 'logitrack', timestamps: false });

// Bloquea (o extiende el bloqueo de) una IP por N minutos.
const block = async (ip, minutes, reason) => {
    const blockedUntil = new Date(Date.now() + minutes * 60 * 1000);
    const existing = await BlockedIp.findOne({ where: { ip } });
    if (existing) {
        await existing.update({ blockedUntil, reason });
        return existing;
    }
    return BlockedIp.create({ ip, blockedUntil, reason });
};

const isBlocked = async (ip) => {
    if (!ip) { return false; }
    const row = await BlockedIp.findOne({ where: { ip, blockedUntil: { [Op.gt]: new Date() } } });
    return !!row;
};

const getAllActive = () =>
    BlockedIp.findAll({ where: { blockedUntil: { [Op.gt]: new Date() } }, order: [['blockedUntil', 'DESC']] });

const unblock = (id) => BlockedIp.destroy({ where: { id } });

module.exports = { BlockedIp, block, isBlocked, getAllActive, unblock };
