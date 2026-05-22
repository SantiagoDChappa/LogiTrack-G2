const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { NotificationEvent: NotificationEventCodes, mapperShipmentStatusToEvent } = require('../constants/enums');

const NotificationEvent = sequelize.define('notificationEvent', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    code:        { type: DataTypes.ENUM(...Object.values(NotificationEventCodes)) },
    description: { type: DataTypes.STRING },
},
{ tableName: 'notification_events' });

const getEventCodeByShipmentStatus = (shipmentId) => {
    return mapperShipmentStatusToEvent[shipmentId] || null;
};

module.exports = { NotificationEvent, getEventCodeByShipmentStatus };
