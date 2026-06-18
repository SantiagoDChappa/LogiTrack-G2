const loginLogModel  = require('../models/loginLog');
const actionLogModel = require('../models/actionLog');
const settingLogModel = require('../models/settingLog');
const userModel = require('../models/user');
const { RoleType } = require('../constants/enums');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

const getAuditoria = async (req, res) => {
    const sessionPage = Math.max(1, parseInt(req.query.sessionPage) || 1);
    const actionPage  = Math.max(1, parseInt(req.query.actionPage)  || 1);

    const sessionFilters = {
        userId: req.query.userId || undefined,
        action: req.query.action || undefined,
        from:   req.query.from   || undefined,
        to:     req.query.to     || undefined,
        page:   sessionPage,
        limit:  50,
    };

    const actionFilters = {
        userId: req.query.aUserId || undefined,
        entity: req.query.entity  || undefined,
        from:   req.query.from    || undefined,
        to:     req.query.to      || undefined,
        page:   actionPage,
        limit:  50,
    };

    const [sessionResult, actionResult, settingLogs, activeUsers, users] = await Promise.all([
        loginLogModel.getAll(sessionFilters).catch(() => ({ rows: [], count: 0, page: 1, pages: 0 })),
        actionLogModel.getAll(actionFilters).catch(() => ({ rows: [], count: 0, page: 1, pages: 0 })),
        settingLogModel.getAll().catch(() => []),
        loginLogModel.getActiveUsers().catch(() => []),
        userModel.getAll().catch(() => []),
    ]);

    res.render('auditoria/index', {
        loginLogs:    sessionResult.rows,
        sessionCount: sessionResult.count,
        sessionPage:  sessionResult.page,
        sessionPages: sessionResult.pages,

        actionLogs:   actionResult.rows,
        actionCount:  actionResult.count,
        actionPage:   actionResult.page,
        actionPages:  actionResult.pages,

        settingLogs,
        activeUsers,
        users,
        auditFilters: { ...sessionFilters, aUserId: actionFilters.userId, entity: actionFilters.entity },
        roleLabels: ROLE_LABELS,
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
            settingLogModel.getAll().catch(() => []),
            actionLogModel.getAll({ limit: 5000 }).catch(() => ({ rows: [] })),
        ]);

        const rows = [['Tipo', 'Fecha y hora', 'Usuario', 'Acción / Parámetro', 'Detalle', 'IP', 'User-Agent']];
        for (const l of sessionResult.rows) {
            rows.push(['Sesión', new Date(l.createdAt).toLocaleString('es-AR'), l.user?.fullName || l.email || 'Desconocido', l.action, '', l.ip || '', l.userAgent || '']);
        }
        for (const l of settingLogs) {
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

module.exports = { getAuditoria, exportCsv };
