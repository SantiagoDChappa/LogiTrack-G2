const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const WhitelistedIp = sequelize.define('whitelistedIp', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ip:        { type: DataTypes.STRING(45), allowNull: false, unique: true },
    note:      { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'whitelisted_ip', schema: 'logitrack', timestamps: false });

const add = async (ip, note) => {
    const existing = await WhitelistedIp.findOne({ where: { ip } });
    if (existing) {
        await existing.update({ note: note || existing.note });
        return existing;
    }
    return WhitelistedIp.create({ ip, note: note || null });
};

const remove = (id) => WhitelistedIp.destroy({ where: { id } });

const getAll = () => WhitelistedIp.findAll({ order: [['createdAt', 'DESC']] });

const isWhitelisted = async (ip) => {
    if (!ip) { return false; }
    const row = await WhitelistedIp.findOne({ where: { ip } });
    return !!row;
};

module.exports = { WhitelistedIp, add, remove, getAll, isWhitelisted };
