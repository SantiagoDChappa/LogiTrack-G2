const loginLogModel  = require('../models/loginLog');
const actionLogModel = require('../models/actionLog');
const settingLogModel = require('../models/settingLog');
const userModel = require('../models/user');
const { RoleType } = require('../constants/enums');
const { avatarColor, initials } = require('../utils/auditHelpers');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

const getResumen = async (req, res) => {
    const [sessionTotal, actionTotal, activeUsers, failedAccounts, activityRows, activeUserStats] = await Promise.all([
        loginLogModel.getAll({ page: 1, limit: 1 }).catch(() => ({ count: 0, rows: [] })),
        actionLogModel.getAll({ page: 1, limit: 1 }).catch(() => ({ count: 0 })),
        loginLogModel.getActiveUsers().catch(() => []),
        loginLogModel.getFailedByAccount({ hours: 24, minAttempts: 3 }).catch(() => []),
        loginLogModel.getActivityByDay({ days: 7 }).catch(() => []),
        loginLogModel.getActiveUserStats().catch(() => ({ dau: 0, wau: 0, mau: 0 })),
    ]);

    const activityMap = {};
    for (const row of activityRows) { activityMap[String(row.day).slice(0, 10)] = row.total; }
    const activity = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        activity.push({
            label: d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }),
            total: activityMap[key] || 0,
        });
    }

    res.render('auditoria/resumen', {
        activeUsersCount: activeUsers.length,
        sessionCount: sessionTotal.count,
        actionCount: actionTotal.count,
        lastEvent: sessionTotal.rows[0] || null,
        failedAccounts,
        activity,
        activeUserStats,
        roleLabels: ROLE_LABELS,
    });
};

const getUsuariosActivos = async (req, res) => {
    const activeUsers = await loginLogModel.getActiveUsers().catch(() => []);
    res.render('auditoria/usuariosActivos', { activeUsers, roleLabels: ROLE_LABELS, avatarColor, initials });
};

const getSesiones = async (req, res) => {
    const sessionPage = Math.max(1, parseInt(req.query.sessionPage) || 1);
    const sessionFilters = {
        userId: req.query.userId || undefined,
        action: req.query.action || undefined,
        from:   req.query.from   || undefined,
        to:     req.query.to     || undefined,
        page:   sessionPage,
        limit:  15,
    };
    const [sessionResult, users] = await Promise.all([
        loginLogModel.getAll(sessionFilters).catch(() => ({ rows: [], count: 0, page: 1, pages: 0 })),
        userModel.getAll().catch(() => []),
    ]);
    res.render('auditoria/sesiones', {
        loginLogs:    sessionResult.rows,
        sessionCount: sessionResult.count,
        sessionPage:  sessionResult.page,
        sessionPages: sessionResult.pages,
        users,
        roleLabels: ROLE_LABELS,
        auditFilters: sessionFilters,
        avatarColor,
        initials,
    });
};

const getAcciones = async (req, res) => {
    const actionPage = Math.max(1, parseInt(req.query.actionPage) || 1);
    const actionFilters = {
        userId: req.query.aUserId || undefined,
        entity: req.query.entity  || undefined,
        from:   req.query.from    || undefined,
        to:     req.query.to      || undefined,
        page:   actionPage,
        limit:  15,
    };
    const [actionResult, users] = await Promise.all([
        actionLogModel.getAll(actionFilters).catch(() => ({ rows: [], count: 0, page: 1, pages: 0 })),
        userModel.getAll().catch(() => []),
    ]);
    res.render('auditoria/acciones', {
        actionLogs:  actionResult.rows,
        actionCount: actionResult.count,
        actionPage:  actionResult.page,
        actionPages: actionResult.pages,
        users,
        roleLabels: ROLE_LABELS,
        auditFilters: { aUserId: actionFilters.userId, entity: actionFilters.entity },
        avatarColor,
        initials,
    });
};

const getConfiguracion = async (req, res) => {
    const settingPage = Math.max(1, parseInt(req.query.settingPage) || 1);
    const settingResult = await settingLogModel.getAll({ page: settingPage, limit: 15 }).catch(() => ({ rows: [], count: 0, page: 1, pages: 0 }));
    res.render('auditoria/configuracion', {
        settingLogs:  settingResult.rows,
        settingCount: settingResult.count,
        settingPage:  settingResult.page,
        settingPages: settingResult.pages,
    });
};

const exportCsv = async (req, res) => {
    try {
        const filters = {
            userId: req.query.userId || undefined,
            action: req.query.action || undefined,
            from:   req.query.from   || undefined,
            to:     req.query.to     || undefined,
            limit:  5000,
        };
        const [sessionResult, settingLogs, actionResult] = await Promise.all([
            loginLogModel.getAll(filters).catch(() => ({ rows: [] })),
            settingLogModel.getAll({ page: 1, limit: 5000 }).catch(() => ({ rows: [] })),
            actionLogModel.getAll({ limit: 5000 }).catch(() => ({ rows: [] })),
        ]);

        const rows = [['Tipo', 'Fecha y hora', 'Usuario', 'Acción / Parámetro', 'Detalle', 'IP', 'User-Agent']];
        for (const l of sessionResult.rows) {
            rows.push(['Sesión', new Date(l.createdAt).toLocaleString('es-AR'), l.user?.fullName || l.email || 'Desconocido', l.action, '', l.ip || '', l.userAgent || '']);
        }
        for (const l of settingLogs.rows) {
            rows.push(['Configuración', new Date(l.changedAt).toLocaleString('es-AR'), l.user?.fullName || 'Sistema', l.key, `${l.oldValue || ''} → ${l.newValue || ''}`, '', '']);
        }
        for (const l of actionResult.rows) {
            const detail = l.detail ? JSON.parse(l.detail) : {};
            rows.push(['Acción', new Date(l.createdAt).toLocaleString('es-AR'), l.user?.fullName || 'Desconocido', `${l.action} ${l.entity} #${l.entityId || ''}`, JSON.stringify(detail), l.ip || '', '']);
        }

        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const filename = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (err) {
        console.error('exportCsv:', err.message);
        res.status(500).send('Error al exportar');
    }
};

module.exports = { getResumen, getUsuariosActivos, getSesiones, getAcciones, getConfiguracion, exportCsv };
