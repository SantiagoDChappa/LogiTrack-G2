const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// LGT-218: notificación in-app (centro de notificaciones por usuario).
const NotificationInApp = sequelize.define('NotificationInApp', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:       { type: DataTypes.INTEGER, allowNull: false },
    event:        { type: DataTypes.STRING(64) },
    title:        { type: DataTypes.STRING(200), allowNull: false },
    body:         { type: DataTypes.TEXT },
    resourceType: { type: DataTypes.STRING(32) },
    resourceId:   { type: DataTypes.INTEGER },
    url:          { type: DataTypes.STRING(300) },
    readAt:       { type: DataTypes.DATE },
    createdAt:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'notification_inapp',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { NotificationInApp };
