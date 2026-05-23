const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { NotificationEvent } = require('../constants/enums');
const { NotificationEvent: NotificationEventsModel } = require('../models/notificationEvents')

const NotificationConfig = sequelize.define('notificationConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    eventCode: {
        type: DataTypes.ENUM(...Object.values(NotificationEvent)),
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

NotificationConfig.belongsTo(NotificationEventsModel, {
    foreignKey: 'eventCode',
    targetKey: 'code',
    as: 'eventDetails' // Alias para facilitar el acceso
});

const isNotificationEnabled = async (eventCode) => {
    const config = await NotificationConfig.findOne({ where: { eventCode } });
    return config ? config.enabled : false;
};

const getAllConfigs = async () => {
    const config = await NotificationConfig.findAll({
        attributes: ['id', 'eventCode', 'enabled'],
        include: [{
            model: NotificationEventsModel,
            as: 'eventDetails',
            attributes: ['description'],
            required: false
        }],
        raw: true,
        nest: true
    });
    return config.map(item => ({
        id: item.id,
        eventCode: item.eventCode,
        description: item.eventDetails?.description || "Sin descripción",
        enabled: item.enabled
    }));
};

module.exports = { NotificationConfig, isNotificationEnabled, getAllConfigs };
