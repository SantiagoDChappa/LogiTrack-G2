// Sprint 3 - 2.5 / 3.2: franjas horarias habilitadas globalmente.
// Sirven para ofrecer opciones al destinatario en autogestión del portal
// y para alta de envío.
const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const DeliveryTimeWindow = sequelize.define('deliveryTimeWindow', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    label:    { type: DataTypes.STRING(40), allowNull: false },
    fromTime: { type: DataTypes.TIME, allowNull: false, field: 'from_time' },
    toTime:   { type: DataTypes.TIME, allowNull: false, field: 'to_time' },
    active:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'delivery_time_window', timestamps: false });

const getActive = () => DeliveryTimeWindow.findAll({ where: { active: true }, order: [['fromTime', 'ASC']] });
const getAll    = () => DeliveryTimeWindow.findAll({ order: [['fromTime', 'ASC']] });

module.exports = { DeliveryTimeWindow, getActive, getAll };
