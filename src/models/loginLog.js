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

// Agrupa los LOGIN_FAILED en "episodios": si pasan más de 10 min sin un nuevo
// intento fallido para la misma cuenta, se considera una ronda distinta (evita
// mezclar pruebas/ataques separados en el tiempo bajo un solo contador).
const getFailedByAccount = async ({ hours = 24, minAttempts = 3 } = {}) => {
    const { QueryTypes } = require('sequelize');
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await sequelize.query(
        `WITH failed AS (
            SELECT
                ll.created_at,
                COALESCE(ll.email, u.email, 'desconocido') AS email,
                u.id AS user_id,
                u."fullName" AS full_name,
                u."roleId" AS role_id,
                b.name AS branch_name,
                u.locked_until,
                LAG(ll.created_at) OVER (
                    PARTITION BY COALESCE(ll.email, u.email, 'desconocido')
                    ORDER BY ll.created_at
                ) AS prev_at
            FROM logitrack.login_log ll
            LEFT JOIN logitrack."user" u ON u.id = ll.user_id
                OR (ll.user_id IS NULL AND u.email = ll.email AND u.active = true)
            LEFT JOIN logitrack.branch b ON b.id = u."branchId"
            WHERE ll.action = 'LOGIN_FAILED' AND ll.created_at >= :since
         ),
         grouped AS (
            SELECT *,
                SUM(CASE WHEN prev_at IS NULL OR created_at - prev_at > INTERVAL '10 minutes' THEN 1 ELSE 0 END)
                    OVER (PARTITION BY email ORDER BY created_at) AS episode
            FROM failed
         )
         SELECT
            email,
            episode,
            COUNT(*)::int AS attempts,
            MIN(created_at) AS "firstAttempt",
            MAX(created_at) AS "lastAttempt",
            user_id AS "userId",
            full_name AS "fullName",
            role_id AS "roleId",
            branch_name AS "branchName",
            locked_until AS "lockedUntil",
            (SELECT MAX(ll2.created_at) FROM logitrack.login_log ll2
                WHERE ll2.user_id = user_id AND ll2.action = 'LOGIN') AS "lastLogin"
         FROM grouped
         GROUP BY email, episode, user_id, full_name, role_id, branch_name, locked_until
         HAVING COUNT(*) >= :min
         ORDER BY "lastAttempt" DESC`,
        { type: QueryTypes.SELECT, replacements: { since, min: minAttempts } }
    );
    return rows;
};

const getActivityByDay = async ({ days = 7 } = {}) => {
    const { QueryTypes } = require('sequelize');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await sequelize.query(
        `SELECT DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AS day, COUNT(*)::int AS total
         FROM logitrack.login_log
         WHERE action = 'LOGIN' AND created_at >= :since
         GROUP BY day ORDER BY day`,
        { type: QueryTypes.SELECT, replacements: { since } }
    );
};

const getUniqueActiveCount = async ({ days } = {}) => {
    const { QueryTypes } = require('sequelize');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await sequelize.query(
        `SELECT COUNT(DISTINCT user_id)::int AS total
         FROM logitrack.login_log
         WHERE action = 'LOGIN' AND user_id IS NOT NULL AND created_at >= :since`,
        { type: QueryTypes.SELECT, replacements: { since } }
    );
    return rows[0]?.total || 0;
};

// DAU/WAU/MAU — usuarios únicos con al menos un login en 1/7/30 días.
const getActiveUserStats = async () => {
    const [dau, wau, mau] = await Promise.all([
        getUniqueActiveCount({ days: 1 }),
        getUniqueActiveCount({ days: 7 }),
        getUniqueActiveCount({ days: 30 }),
    ]);
    return { dau, wau, mau };
};

// IPs que aparecen en intentos fallidos de 2+ cuentas DISTINTAS, ambas
// actualmente bloqueadas — señal fuerte de ataque coordinado desde un mismo origen.
const getSharedAttackIps = async ({ hours = 2 } = {}) => {
    const { QueryTypes } = require('sequelize');
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await sequelize.query(
        `SELECT ll.ip, COUNT(DISTINCT ll.user_id)::int AS accounts
         FROM logitrack.login_log ll
         JOIN logitrack."user" u ON u.id = ll.user_id
         WHERE u.locked_until > NOW()
           AND ll.action = 'LOGIN_FAILED'
           AND ll.ip IS NOT NULL
           AND ll.created_at >= :since
         GROUP BY ll.ip
         HAVING COUNT(DISTINCT ll.user_id) >= 2
         ORDER BY accounts DESC`,
        { type: QueryTypes.SELECT, replacements: { since } }
    );
    return rows;
};

module.exports = { LoginLog, record, getAll, getActiveUsers, getFailedByAccount, getActivityByDay, getActiveUserStats, getSharedAttackIps };
