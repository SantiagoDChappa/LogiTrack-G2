const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.locals.currentUser = decoded;
        next();
    } catch {
        return res.status(401).redirect('/login');
    }
};

const requireSupervisor = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    if (res.locals.currentUser?.roleId !== RoleType.SUPERVISOR.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de supervisor' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de supervisor');
    }
    next();
};

const requireOperator = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.OPERATOR.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de operador o supervisor' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de operador o supervisor');
    }
    next();
};

const requireDelivery = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.DELIVERY.id) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de repartidor o supervisor' });
        }
        return res.status(403).send('Acceso denegado: se requieren permisos de repartidor o supervisor');
    }
    next();
};

module.exports = { requireAuth, requireSupervisor, requireOperator, requireDelivery };
