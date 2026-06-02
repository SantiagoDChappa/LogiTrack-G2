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
        type: DataTypes.STRING(60),
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
    format: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'text',
    },
},
    {
        tableName: 'email_template',
    });

const getTemplateByEventCode = async (eventCode) => {
    return await EmailTemplate.findOne({ where: { eventCode } });
};

const getAll = async () => {
    return EmailTemplate.findAll({ order: [['id', 'ASC']] });
};

const updateTemplate = async (eventCode, { subject, body, format }) => {
    const tpl = await EmailTemplate.findOne({ where: { eventCode } });
    if (!tpl) { return null; }
    if (subject !== undefined) { tpl.subject = subject; }
    if (body    !== undefined) { tpl.body    = body;    }
    if (format  !== undefined) { tpl.format  = format;  }
    await tpl.save();
    return tpl;
};

module.exports = { EmailTemplate, getTemplateByEventCode, getAll, updateTemplate };