const userModel = require('../models/user');
const branchModel = require('../models/branch');
const loginLogModel = require('../models/loginLog');
const actionLogModel = require('../models/actionLog');
const { RoleType } = require('../constants/enums');
const { avatarColor, initials } = require('../utils/auditHelpers');

const ROLE_LABELS = Object.fromEntries(Object.values(RoleType).map(r => [r.id, r.description]));

// Combina datos del usuario (rol, sucursal, estado) con su actividad (último
// ingreso, logins y cambios en el rango filtrado) — para el Reporte de usuarios.
const buildUsersReportData = async (query) => {
    const roleId = query.roleId || '';
    const from = query.from || '';
    const to = query.to || '';

    const [users, branches, lastLoginMap, loginCounts, changeCounts] = await Promise.all([
        userModel.search({ roleId }).catch(() => []),
        branchModel.getAll().catch(() => []),
        loginLogModel.getLastLoginMap().catch(() => ({})),
        loginLogModel.getLoginCountsByUser({ from, to }).catch(() => ({})),
        actionLogModel.getChangeCountsByEntity({ entity: 'USER', from, to }).catch(() => ({})),
    ]);

    const branchName = (id) => {
        if (!id) { return '—'; }
        const b = branches.find(br => br.id === Number(id));
        return b ? b.name : `#${id}`;
    };

    const rows = users.map(u => ({
        id: u.id,
        fullName: u.fullName,
        document: u.document,
        email: u.email,
        roleId: u.roleId,
        roleLabel: ROLE_LABELS[u.roleId] || '—',
        branchLabel: branchName(u.branchId),
        active: u.active,
        lastLogin: lastLoginMap[u.id] || null,
        loginCount: loginCounts[u.id] || 0,
        changeCount: changeCounts[u.id] || 0,
    }));

    return { rows, filters: { roleId, from, to } };
};

const getUsersReport = async (req, res) => {
    const data = await buildUsersReportData(req.query);
    data.narrative = require('../services/reportNarrator').usersReport(data);
    res.render('report/users', { ...data, roleTypes: Object.values(RoleType), avatarColor, initials });
};

const exportUsersReport = async (req, res) => {
    try {
        const data = await buildUsersReportData(req.query);
        const rows = [['Nombre', 'Documento', 'Email', 'Rol', 'Sucursal', 'Estado', 'Último ingreso', 'Logins en el período', 'Cambios en el período']];
        for (const u of data.rows) {
            rows.push([
                u.fullName,
                u.document,
                u.email,
                u.roleLabel,
                u.branchLabel,
                u.active ? 'Alta' : 'Baja',
                u.lastLogin ? new Date(u.lastLogin).toLocaleString('es-AR') : 'Nunca ingresó',
                u.loginCount,
                u.changeCount,
            ]);
        }
        const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const filename = `reporte_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (err) {
        console.error('exportUsersReport:', err.message);
        res.status(500).send('Error al exportar');
    }
};

module.exports = { getUsersReport, exportUsersReport };
