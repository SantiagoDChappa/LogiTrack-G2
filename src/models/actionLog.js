const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const ActionLog = sequelize.define('actionLog', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:   { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    action:   { type: DataTypes.STRING(30), allowNull: false },
    entity:   { type: DataTypes.STRING(20), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: true, field: 'entity_id' },
    detail:   { type: DataTypes.TEXT, allowNull: true },
    ip:       { type: DataTypes.STRING(45), allowNull: true },
    createdAt:{ type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { timestamps: false, tableName: 'action_log', schema: 'logitrack' });

const setupAssociations = () => {
    if (!ActionLog.associations.user) {
        const { User } = require('./user');
        ActionLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    }
};

const record = async (userId, action, entity, entityId, detail, req) => {
    try {
        const ip = req?.headers?.['x-forwarded-for']?.split(',')[0].trim() || req?.socket?.remoteAddress || null;
        await ActionLog.create({
            userId: userId || null,
            action,
            entity,
            entityId: entityId || null,
            detail: detail ? JSON.stringify(detail) : null,
            ip,
        });
    } catch (e) {
        console.error('[actionLog] error al registrar:', e.message);
    }
};

const getAll = async ({ userId, entity, action, from, to, page = 1, limit = 50 } = {}) => {
    setupAssociations();
    const { User } = require('./user');
    const { Op } = require('sequelize');
    const where = {};
    if (userId) { where.userId = userId; }
    if (entity) { where.entity = entity; }
    if (action) { where.action = action; }
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(from); }
        if (to)   { where.createdAt[Op.lte] = new Date(to + 'T23:59:59'); }
    }
    const offset = (Math.max(1, page) - 1) * limit;
    const { count, rows } = await ActionLog.findAndCountAll({
        where,
        include: [{ model: User, as: 'user', required: false, attributes: ['fullName', 'email', 'roleId'] }],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
    });
    return { rows, count, page: Number(page), pages: Math.ceil(count / limit) };
};

module.exports = { ActionLog, record, getAll };
