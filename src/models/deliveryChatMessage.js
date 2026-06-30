// Última Milla — mensaje de un chat de entrega. sender_role distingue quién escribió
// sin exponer datos personales (DRIVER | CLIENT). Todo queda registrado.
const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const DeliveryChatMessage = sequelize.define('deliveryChatMessage', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    chatId:     { type: DataTypes.INTEGER, allowNull: false, field: 'chat_id' },
    senderRole: { type: DataTypes.STRING(10), allowNull: false, field: 'sender_role' }, // DRIVER | CLIENT
    body:       { type: DataTypes.TEXT, allowNull: false },
    createdAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    readAt:     { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
}, { tableName: 'delivery_chat_message', timestamps: false });

const SenderRole = Object.freeze({ DRIVER: 'DRIVER', CLIENT: 'CLIENT' });

module.exports = { DeliveryChatMessage, SenderRole };
