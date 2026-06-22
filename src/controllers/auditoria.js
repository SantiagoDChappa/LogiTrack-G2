const loginLogModel  = require('../models/loginLog');
const actionLogModel = require('../models/actionLog');
const settingLogModel = require('../models/settingLog');
const userModel = require('../models/user');
const branchModel = require('../models/branch');
const blockedIpModel = require('../models/blockedIp');
const whitelistedIpModel = require('../models/whitelistedIp');
const { RoleType } = require('../constants/enums');
const { avatarColor, initials } = require('../utils/auditHelpers');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

// Compartido entre la página de Resumen y su export CSV, para no duplicar las queries.
const buildResumenData = async () => {
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
            // Día completo + fecha numérica para el export CSV: evita que Excel
            // confunda "mar" (martes, abreviado) con "marzo" y reformatee la celda.
            dayName: d.toLocaleDateString('es-AR', { weekday: 'long' }),
            date: d.toLocaleDateString('es-AR'),
            total: activityMap[key] || 0,
        });
    }

    return {
        activeUsersCount: activeUsers.length,
        sessionCount: sessionTotal.count,
        actionCount: actionTotal.count,
        lastEvent: sessionTotal.rows[0] || null,
        failedAccounts,
        activity,
        activeUserStats,
    };
};

const getResumen = async (req, res) => {
    const data = await buildResumenData();
    res.render('auditoria/resumen', data);
};

const getSeguridad = async (req, res) => {
    const [failedAccounts, blockedIps, branches, whitelistedIps] = await Promise.all([
        loginLogModel.getFailedByAccount({ hours: 24, minAttempts: 3 }).catch(() => []),
        blockedIpModel.getAllActive().catch(() => []),
        branchModel.getAll().catch(() => []),
        whitelistedIpModel.getAll().catch(() => []),
    ]);
    res.render('auditoria/seguridad', { failedAccounts, blockedIps, branches, whitelistedIps, roleLabels: ROLE_LABELS, avatarColor, initials });
};

// LGT-193 — agregar una IP a la lista de confianza (nunca se bloquea automáticamente).
const addWhitelistedIp = async (req, res) => {
    try {
        const ip = String(req.body.ip || '').trim();
        if (!ip) { return res.redirect('/auditoria/seguridad'); }
        await whitelistedIpModel.add(ip, req.body.note);
        // Si esa IP ya estaba bloqueada, la liberamos al instante: no tiene sentido
        // que quede bloqueada una IP que acabamos de marcar como de confianza.
        await blockedIpModel.unblockByIp(ip);
        actionLogModel.record(res.locals.currentUser?.id, 'CREATE', 'IP', null, { ip, note: req.body.note }, req);
        res.redirect('/auditoria/seguridad');
    } catch (err) {
        console.error('ERROR addWhitelistedIp:', err.message);
        res.status(500).send('Error al agregar la IP: ' + err.message);
    }
};

// Quitar una IP de la lista de confianza.
const removeWhitelistedIp = async (req, res) => {
    try {
        await whitelistedIpModel.remove(req.params.id);
        actionLogModel.record(res.locals.currentUser?.id, 'DELETE', 'IP', Number(req.params.id), null, req);
        res.redirect('/auditoria/seguridad');
    } catch (err) {
        console.error('ERROR removeWhitelistedIp:', err.message);
        res.status(500).send('Error al quitar la IP: ' + err.message);
    }
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

// Export CSV de la página Resumen: stats generales, DAU/WAU/MAU, actividad de
// 7 días y el detalle de cuentas con intentos fallidos (la alerta de seguridad).
const exportResumenCsv = async (req, res) => {
    try {
        const data = await buildResumenData();
        const rows = [];

        rows.push(['Resumen general']);
        rows.push(['Activos ahora (8h)', data.activeUsersCount]);
        rows.push(['Sesiones en el log (total)', data.sessionCount]);
        rows.push(['Acciones registradas', data.actionCount]);
        rows.push(['Última actividad', data.lastEvent ? new Date(data.lastEvent.createdAt).toLocaleString('es-AR') : '—']);
        rows.push(['Última actividad — usuario', data.lastEvent?.user?.fullName || data.lastEvent?.email || '—']);
        rows.push([]);

        rows.push(['Usuarios activos por período']);
        rows.push(['Hoy (DAU)', data.activeUserStats.dau]);
        rows.push(['Esta semana (WAU)', data.activeUserStats.wau]);
        rows.push(['Este mes (MAU)', data.activeUserStats.mau]);
        rows.push([]);

        rows.push(['Actividad de los últimos 7 días']);
        rows.push(['Fecha', 'Día', 'Logins']);
        for (const a of data.activity) { rows.push([a.date, a.dayName, a.total]); }
        rows.push([]);

        rows.push(['Cuentas con intentos fallidos (últimas 24 h)']);
        rows.push(['Email', 'Usuario', 'Rol', 'Sucursal', 'Intentos', 'Primer intento', 'Último intento', 'Bloqueada hasta', 'Último login OK']);
        for (const a of data.failedAccounts) {
            rows.push([
                a.email,
                a.userId ? a.fullName : 'No registrada',
                a.roleId ? (ROLE_LABELS[a.roleId] || '') : '',
                a.branchName || '',
                a.attempts,
                new Date(a.firstAttempt).toLocaleString('es-AR'),
                new Date(a.lastAttempt).toLocaleString('es-AR'),
                a.lockedUntil && new Date(a.lockedUntil) > new Date() ? new Date(a.lockedUntil).toLocaleString('es-AR') : '',
                a.lastLogin ? new Date(a.lastLogin).toLocaleString('es-AR') : '',
            ]);
        }

        const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const filename = `auditoria_resumen_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (err) {
        console.error('exportResumenCsv:', err.message);
        res.status(500).send('Error al exportar');
    }
};

// LGT-193 — desbloqueo manual de una IP bloqueada automáticamente.
const unblockIp = async (req, res) => {
    try {
        await blockedIpModel.unblock(req.params.id);
        actionLogModel.record(res.locals.currentUser?.id, 'UNLOCK', 'IP', Number(req.params.id), null, req);
        res.redirect('/auditoria');
    } catch (err) {
        console.error('ERROR unblockIp:', err.message);
        res.status(500).send('Error al desbloquear la IP: ' + err.message);
    }
};

module.exports = { getResumen, getSeguridad, getUsuariosActivos, getSesiones, getAcciones, getConfiguracion, exportCsv, exportResumenCsv, unblockIp, addWhitelistedIp, removeWhitelistedIp };
