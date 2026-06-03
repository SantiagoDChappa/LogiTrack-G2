const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        const returnTo = req.originalUrl;
        return res.status(401).redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Refrescar branchId desde DB si en el token vino null (asignacion posterior al login)
        if (decoded?.id && !decoded.branchId) {
            try {
                const userModel = require('../models/user');
                const fresh = await userModel.getById(decoded.id);
                if (fresh?.branchId) {
                    decoded.branchId = fresh.branchId;
                    const branchModel = require('../models/branch');
                    const b = await branchModel.getById(fresh.branchId);
                    if (b) {
                        decoded.branch = { id: b.id, latitude: b.latitude, longitude: b.longitude };
                    }
                }
            } catch { /* ignore */ }
        }
        res.locals.currentUser = decoded;
        const settingModel = require('../models/setting');
        const [nombreEmpresa, logoEmpresa] = await Promise.all([
            settingModel.get('nombre_empresa'),
            settingModel.get('logo_empresa'),
        ]);
        res.locals.nombreEmpresa = nombreEmpresa || 'LogiTrack';
        res.locals.logoEmpresa   = logoEmpresa || '/images/logo.png';
        next();
    } catch {
        const returnTo = req.originalUrl;
        return res.status(401).redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
};

const requireAdmin = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    if (res.locals.currentUser?.roleId !== RoleType.ADMIN.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de administrador');
    }
    next();
};

const requireSupervisor = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.ADMIN.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de supervisor' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de supervisor');
    }
    next();
};

const requireSupervisorOrOperator = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.OPERATOR.id && roleId !== RoleType.ADMIN.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de supervisor u operador' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de supervisor u operador');
    }
    next();
};

const requireDelivery = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    if (res.locals.currentUser?.roleId !== RoleType.DELIVERY.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de repartidor' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de repartidor');
    }
    next();
};

const requireSupervisorOrAdmin = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.ADMIN.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de supervisor o administrador' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de supervisor o administrador');
    }
    next();
};

module.exports = { requireAuth, requireAdmin, requireSupervisor, requireSupervisorOrOperator, requireDelivery, requireSupervisorOrAdmin };
