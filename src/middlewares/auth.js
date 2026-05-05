const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        const returnTo = req.originalUrl;
        return res.status(401).redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.locals.currentUser = decoded;
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
    if (res.locals.currentUser?.roleId !== RoleType.ADMIN.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de administrador');
    }
    next();
};

const requireSupervisorOrOperator = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.ADMIN.id && roleId !== RoleType.OPERATOR.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador u operador' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de administrador u operador');
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
