const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { NotificationEvent: NotificationEventsModel } = require('../models/notificationEvents');

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
    // LGT-219: canales activos del evento, CSV de 'in-app','email','sms'. Default 'email'.
    channels: {
        type: DataTypes.STRING(60),
        allowNull: false,
        defaultValue: 'email',
    },
},
    {
        tableName: 'notification_config',
    });

// LGT-219 — helpers de canales.
const VALID_CHANNELS = ['in-app', 'email', 'sms'];
const parseChannels = (raw) => String(raw || '')
    .split(',').map(s => s.trim()).filter(c => VALID_CHANNELS.includes(c));
const serializeChannels = (arr) => {
    const clean = (Array.isArray(arr) ? arr : []).filter(c => VALID_CHANNELS.includes(c));
    return Array.from(new Set(clean)).join(',');
};

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
        attributes: ['id', 'eventCode', 'enabled', 'recipientMode', 'customEmail', 'channels'],
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
        channels: parseChannels(item.channels).length ? parseChannels(item.channels) : ['email'],
    }));
};

const getConfigByEvent = async (eventCode) => {
    return NotificationConfig.findOne({ where: { eventCode } });
};

module.exports = {
    NotificationConfig, isNotificationEnabled, getAllConfigs, getConfigByEvent,
    VALID_CHANNELS, parseChannels, serializeChannels,
};
