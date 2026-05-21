const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const NotificationConfig = sequelize.define('notificationConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    eventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
},
    {
        tableName: 'notification_config',
    });

const isNotificationEnabled = async (eventId) => {
    const config = await NotificationConfig.findOne({ where: { eventId } });
    return config ? config.enabled : false;
}

module.exports = { NotificationConfig, isNotificationEnabled };
