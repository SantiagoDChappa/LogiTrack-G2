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
        type: DataTypes.STRING(60),
        allowNull: false,
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    recipientMode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'recipient',
        field: 'recipient_mode',
    },
    customEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'custom_email',
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
        attributes: ['id', 'eventCode', 'enabled', 'recipientMode', 'customEmail'],
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
        enabled: item.enabled,
        recipientMode: item.recipientMode || 'recipient',
        customEmail: item.customEmail || '',
    }));
};

const getConfigByEvent = async (eventCode) => {
    return NotificationConfig.findOne({ where: { eventCode } });
};

module.exports = { NotificationConfig, isNotificationEnabled, getAllConfigs, getConfigByEvent };
