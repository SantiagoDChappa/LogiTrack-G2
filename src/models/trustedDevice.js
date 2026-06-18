const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

// #2 2FA — dispositivo recordado ("no volver a pedir el código por 30 días").
// Se guarda el hash del token (la cookie tiene el token en claro).
const TrustedDevice = sequelize.define('trusted_device', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:    { type: DataTypes.INTEGER,    allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE,       allowNull: false, field: 'expires_at' },
    userAgent: { type: DataTypes.STRING(255), allowNull: true, field: 'user_agent' },
    createdAt: { type: DataTypes.DATE,       allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'trusted_device', timestamps: false });

const create = ({ userId, tokenHash, expiresAt, userAgent }) =>
    TrustedDevice.create({ userId, tokenHash, expiresAt, userAgent: (userAgent || '').slice(0, 255) });

const findValid = (userId, tokenHash) =>
    TrustedDevice.findOne({
        where: { userId, tokenHash, expiresAt: { [Op.gt]: new Date() } },
    });

// Revoca todos los dispositivos confiables de un usuario (al desactivar 2FA o reset admin).
const removeForUser = (userId) => TrustedDevice.destroy({ where: { userId } });

module.exports = { TrustedDevice, create, findValid, removeForUser };
