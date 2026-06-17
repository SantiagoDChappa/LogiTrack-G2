const jwt = require('jsonwebtoken');

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        const returnTo = req.originalUrl;
        return res.status(401).redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Refrescar desde DB: onboarded (no está en el JWT) y branchId (puede asignarse post-login)
        if (decoded?.id) {
            try {
                const userModel = require('../models/user');
                const fresh = await userModel.getById(decoded.id);
                if (fresh) {
                    decoded.onboarded = fresh.onboarded;
                    if (!decoded.branchId && fresh.branchId) {
                        decoded.branchId = fresh.branchId;
                        const branchModel = require('../models/branch');
                        const b = await branchModel.getById(fresh.branchId);
                        if (b) decoded.branch = { id: b.id, latitude: b.latitude, longitude: b.longitude };
                    }
                }
            } catch { /* ignore */ }
        }
        res.locals.currentUser = decoded;
        const settingModel = require('../models/setting');
        const statusModel  = require('../models/status');
        const statusColors = require('../services/statusColors');
        const [allSettings, statuses] = await Promise.all([
            settingModel.getAll(),
            statusModel.getAll().catch(() => []),
        ]);
        res.locals.nombreEmpresa   = allSettings.nombre_empresa || 'LogiTrack';
        // LGT-172: logo institucional configurable.
        res.locals.logoEmpresa     = allSettings.logo_empresa || '/images/logo.png';
        // LGT-173: CSS de colores de estados configurados (se inyecta en el <head>).
        // Incluye estados de envío y estados de incidencia.
        res.locals.statusColorsCss = [
            statusColors.buildCss(allSettings, statuses),
            statusColors.buildIncidentCss(allSettings),
        ].filter(Boolean).join('\n');

        // Fecha/hora parametrizable (zona horaria + 12/24 hs). Helpers disponibles en todas las vistas.
        const dt = require('../utils/datetime');
        const tz      = allSettings.display_timezone || dt.DEFAULT_TZ;
        const hour24  = allSettings.clock_24h !== '0';   // default 24 hs
        res.locals.displayTimezone = tz;
        res.locals.clock24h        = hour24;
        res.locals.fmtDateTime = (v) => dt.formatDateTime(v, { timeZone: tz, hour24 });
        res.locals.fmtDate     = (v) => dt.formatDate(v, { timeZone: tz });
        res.locals.fmtTime     = (v) => dt.formatTime(v, { timeZone: tz, hour24 });
        next();
    } catch {
        const returnTo = req.originalUrl;
        return res.status(401).redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
};

// Responde 403: JSON para rutas /api/, popup (error.ejs en modo modal) para navegación.
const denyAccess = (req, res, reason) => {
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: reason });
    }
    return res.status(403).render('error', { status: 403, reason, popup: true });
};

const requireAdmin = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    if (res.locals.currentUser?.roleId !== RoleType.ADMIN.id) {
        return denyAccess(req, res, 'Acceso denegado: se requieren permisos de administrador');
    }
    next();
};

const requireSupervisor = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.ADMIN.id) {
        return denyAccess(req, res, 'Acceso denegado: se requieren permisos de supervisor');
    }
    next();
};

const requireSupervisorOrOperator = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.OPERATOR.id && roleId !== RoleType.ADMIN.id) {
        return denyAccess(req, res, 'Acceso denegado: se requieren permisos de supervisor u operador');
    }
    next();
};

const requireDelivery = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    if (res.locals.currentUser?.roleId !== RoleType.DELIVERY.id) {
        return denyAccess(req, res, 'Acceso denegado: se requieren permisos de repartidor');
    }
    next();
};

const requireSupervisorOrAdmin = (req, res, next) => {
    const { RoleType } = require('../constants/enums');
    const roleId = res.locals.currentUser?.roleId;
    if (roleId !== RoleType.SUPERVISOR.id && roleId !== RoleType.ADMIN.id) {
        return denyAccess(req, res, 'Acceso denegado: se requieren permisos de supervisor o administrador');
    }
    next();
};

module.exports = { requireAuth, requireAdmin, requireSupervisor, requireSupervisorOrOperator, requireDelivery, requireSupervisorOrAdmin };
