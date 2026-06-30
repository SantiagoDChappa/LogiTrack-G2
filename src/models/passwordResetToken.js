const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

// #3 Recuperar contraseña — token de reset (se guarda el hash, single-use, con expiry).
const PasswordResetToken = sequelize.define('password_reset_token', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:    { type: DataTypes.INTEGER,    allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE,       allowNull: false, field: 'expires_at' },
    usedAt:    { type: DataTypes.DATE,       allowNull: true,  field: 'used_at' },
    createdAt: { type: DataTypes.DATE,       allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'password_reset_token', timestamps: false });

const create = ({ userId, tokenHash, expiresAt }) =>
    PasswordResetToken.create({ userId, tokenHash, expiresAt });

// Token vigente: existe, no usado y no vencido.
const findValidByHash = (tokenHash) =>
    PasswordResetToken.findOne({
        where: { tokenHash, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    });

const markUsed = (id) => PasswordResetToken.update({ usedAt: new Date() }, { where: { id } });

// Invalida los tokens vigentes de un usuario (al pedir uno nuevo o tras consumir uno).
const invalidateForUser = (userId) =>
    PasswordResetToken.update({ usedAt: new Date() }, { where: { userId, usedAt: null } });

module.exports = { PasswordResetToken, create, findValidByHash, markUsed, invalidateForUser };
