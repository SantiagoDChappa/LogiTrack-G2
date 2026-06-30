const jwt = require('jsonwebtoken');

const isApiRequest = (req) => (req.originalUrl || '').startsWith('/api/');

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'No autenticado' });
        }
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
                    decoded.helpSeen = userModel.parseHelpSeenModules(fresh.helpSeenModules);
                    if (!decoded.branchId && fresh.branchId) {
                        decoded.branchId = fresh.branchId;
                        const branchModel = require('../models/branch');
                        const b = await branchModel.getById(fresh.branchId);
                        if (b) decoded.branch = { id: b.id, latitude: b.latitude, longitude: b.longitude };
                    }
                }
            } catch { /* ignore */ }
        }
        if (decoded?.id != null)      { decoded.id = Number(decoded.id); }
        if (decoded?.roleId != null)  { decoded.roleId = Number(decoded.roleId); }
        if (decoded?.branchId != null){ decoded.branchId = Number(decoded.branchId); }
        res.locals.currentUser = decoded;

        // #1 Primer ingreso: con contraseña temporal pendiente, forzar el cambio antes de
        // acceder a cualquier otra ruta (salvo la propia pantalla de cambio y el logout).
        if (decoded.mustChangePassword) {
            const url = req.originalUrl || '';
            if (!url.startsWith('/account/password/forced') && !url.startsWith('/logout')) {
                if (url.startsWith('/api/')) {
                    return res.status(403).json({ error: 'Debés cambiar tu contraseña temporal antes de continuar.' });
                }
                return res.redirect('/account/password/forced');
            }
        }

        // #2 2FA obligatorio (Supervisor/Admin): NO pueden quedar con sesión completa sin 2FA.
        // Una sesión así (p. ej. anterior a la feature) se desloguea; se reenrolan al re-loguear.
        const { RoleType } = require('../constants/enums');
        if (!decoded.mustChangePassword
            && [RoleType.SUPERVISOR.id, RoleType.ADMIN.id].includes(decoded.roleId)
            && !decoded.twoFactorEnabled) {
            const url2 = req.originalUrl || '';
            if (!url2.startsWith('/logout')) {
                res.clearCookie('token');
                if (url2.startsWith('/api/')) {
                    return res.status(403).json({ error: '2FA requerido. Iniciá sesión de nuevo para configurarlo.' });
                }
                return res.redirect('/login');
            }
        }

        // #2 Nudge: ofrecer activar 2FA. Solo en el home del repartidor (roleId 3),
        // no en el resto de las vistas (p. ej. el ruteo/mapa). La X lo descarta por esta sesión.
        const nudgeUrl = (req.originalUrl || '').split('?')[0].replace(/\/$/, '');
        res.locals.showTfaNudge = !decoded.twoFactorEnabled
            && decoded.roleId === RoleType.DELIVERY.id
            && nudgeUrl === '/delivery'
            && req.cookies?.tfaNudge !== 'off';

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
        // Serializa datos para embeber dentro de <script> sin riesgo de inyección: escapa
        // los caracteres que podrían cerrar el tag o romper el parser (</script>, U+2028/9).
        // Uso en vistas: <script>window.X = <%- jsonScript(data) %>;</script>
        res.locals.jsonScript = (v) => JSON.stringify(v === undefined ? null : v)
            .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

        next();
    } catch {
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }
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
