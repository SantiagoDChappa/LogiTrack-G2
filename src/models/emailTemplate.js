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
    name: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: 'Principal',
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'isDefault',
    },
},
    {
        tableName: 'email_template',
    });

// Plantilla usada al enviar: la predeterminada del evento (fallback a la primera).
const getDefaultByEventCode = async (eventCode) => {
    return (await EmailTemplate.findOne({ where: { eventCode, isDefault: true } }))
        || (await EmailTemplate.findOne({ where: { eventCode }, order: [['id', 'ASC']] }));
};

// Compat: algunos llamadores antiguos esperan "la" plantilla del evento.
const getTemplateByEventCode = (eventCode) => getDefaultByEventCode(eventCode);

const getByEvent = (eventCode) => EmailTemplate.findAll({
    where: { eventCode }, order: [['isDefault', 'DESC'], ['id', 'ASC']]
});

const getAll = () => EmailTemplate.findAll({ order: [['eventCode', 'ASC'], ['id', 'ASC']] });

const getById = (id) => EmailTemplate.findOne({ where: { id } });

// email_template.id es INT sin SERIAL en el esquema → asignar id manual.
const nextId = async () => {
    const max = await EmailTemplate.max('id');
    return (Number.isFinite(max) ? max : 0) + 1;
};

const createVariant = async (eventCode, { name, subject, body, format }) => {
    const id = await nextId();
    return EmailTemplate.create({
        id, eventCode,
        name:    name || 'Variante',
        subject: subject || '(sin asunto)',
        body:    body || '',
        format:  format === 'html' ? 'html' : 'text',
        isDefault: false
    });
};

const updateById = async (id, { name, subject, body, format }) => {
    const tpl = await EmailTemplate.findOne({ where: { id } });
    if (!tpl) { return null; }
    if (name    !== undefined) { tpl.name    = name;    }
    if (subject !== undefined) { tpl.subject = subject; }
    if (body    !== undefined) { tpl.body    = body;    }
    if (format  !== undefined) { tpl.format  = format;  }
    await tpl.save();
    return tpl;
};

const setDefault = async (id) => {
    const tpl = await EmailTemplate.findOne({ where: { id } });
    if (!tpl) { return null; }
    await sequelize.transaction(async (t) => {
        await EmailTemplate.update({ isDefault: false }, { where: { eventCode: tpl.eventCode }, transaction: t });
        await EmailTemplate.update({ isDefault: true },  { where: { id }, transaction: t });
    });
    return tpl;
};

const deleteVariant = async (id) => {
    const tpl = await EmailTemplate.findOne({ where: { id } });
    if (!tpl) { return { ok: false, reason: 'not_found' }; }
    const count = await EmailTemplate.count({ where: { eventCode: tpl.eventCode } });
    if (count <= 1) { return { ok: false, reason: 'last' }; }
    const wasDefault = tpl.isDefault;
    await tpl.destroy();
    if (wasDefault) {
        const fallback = await EmailTemplate.findOne({ where: { eventCode: tpl.eventCode }, order: [['id', 'ASC']] });
        if (fallback) { await fallback.update({ isDefault: true }); }
    }
    return { ok: true };
};

// Compat: updateTemplate(eventCode, {...}) sigue funcionando sobre la predeterminada.
const updateTemplate = async (eventCode, { subject, body, format, name }) => {
    const tpl = await getDefaultByEventCode(eventCode);
    if (!tpl) { return null; }
    return updateById(tpl.id, { subject, body, format, name });
};

module.exports = {
    EmailTemplate, getTemplateByEventCode, getDefaultByEventCode, getByEvent,
    getAll, getById, createVariant, updateById, updateTemplate, setDefault, deleteVariant
};