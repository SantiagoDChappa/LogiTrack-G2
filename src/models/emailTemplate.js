const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const EmailTemplate = sequelize.define('emailTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    eventId: {
        type: DataTypes.INTEGER,
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

const getTemplateByEventId = async (eventId) => {
    return await EmailTemplate.findOne({ where: { eventId } });
}

module.exports = { EmailTemplate, getTemplateByEventId };