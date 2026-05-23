const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { NotificationEvent } = require('../constants/enums')

const EmailTemplate = sequelize.define('emailTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    eventCode: {
        type: DataTypes.ENUM(...Object.values(NotificationEvent)),
        allowNull: false,

    },
    subject: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
},
    {
        tableName: 'email_template',
    });

const getTemplateByEventCode = async (eventCode) => {
    return await EmailTemplate.findOne({ where: { eventCode } });
}

module.exports = { EmailTemplate, getTemplateByEventCode };