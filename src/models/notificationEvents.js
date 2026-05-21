const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { NotificationEvent } = require('../constants/enums') 

const NotificationEvent = sequelize.define('notification_event', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    code:        { type: DataTypes.ENUM(...NotificationEvent) },
    description: { type: DataTypes.STRING },
},
{ tableName: 'notification_event' });

module.exports = { NotificationEvent };