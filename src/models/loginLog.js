const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const LoginLog = sequelize.define('loginLog', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:    { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    email:     { type: DataTypes.STRING(255), allowNull: true },
    action:    { type: DataTypes.STRING(15), allowNull: false },  // LOGIN | LOGOUT | LOGIN_FAILED
    ip:        { type: DataTypes.STRING(45), allowNull: true },
    userAgent: { type: DataTypes.TEXT, allowNull: true, field: 'user_agent' },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
}, {
    timestamps: false,
    tableName: 'login_log',
    schema: 'logitrack',
});

const setupAssociations = () => {
    if (!LoginLog.associations.user) {
        const { User } = require('./user');
        LoginLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    }
};

const record = async (userId, action, req, email = null) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        await LoginLog.create({ userId, action, ip, userAgent, email });
    } catch (e) {
        console.error('[loginLog] error al registrar:', e.message);
    }
};

const getAll = async ({ userId, action, from, to, page = 1, limit = 50 } = {}) => {
    setupAssociations();
    const { User } = require('./user');
    const { Op } = require('sequelize');
    const where = {};
    if (userId) { where.userId = userId; }
    if (action) { where.action = action; }
    if (from || to) {
        where.createdAt = {};
        if (from) { where.createdAt[Op.gte] = new Date(from); }
        if (to)   { where.createdAt[Op.lte] = new Date(to + 'T23:59:59'); }
    }
    const offset = (Math.max(1, page) - 1) * limit;
    const { count, rows } = await LoginLog.findAndCountAll({
        where,
        include: [{ model: User, as: 'user', required: false, attributes: ['fullName', 'email', 'roleId'] }],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
    });
    return { rows, count, page: Number(page), pages: Math.ceil(count / limit) };
};

const getActiveUsers = async () => {
    setupAssociations();
    const { User } = require('./user');
    const { Op } = require('sequelize');
    const since = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const all = await LoginLog.findAll({
        where: { action: { [Op.in]: ['LOGIN', 'LOGOUT'] }, createdAt: { [Op.gte]: since } },
        include: [{ model: User, as: 'user', required: false, attributes: ['fullName', 'email', 'roleId'] }],
        order: [['createdAt', 'DESC']],
    });
    const latest = {};
    for (const l of all) {
        if (!latest[l.userId]) { latest[l.userId] = l; }
    }
    return Object.values(latest).filter(l => l.action === 'LOGIN');
};

module.exports = { LoginLog, record, getAll, getActiveUsers };
