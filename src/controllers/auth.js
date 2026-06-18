const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const userModel = require('../models/user');
const branchModel = require('../models/branch');
const { RoleType } = require('../constants/enums');
const crypto = require('crypto');
const trustedDeviceModel = require('../models/trustedDevice');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// #2 2FA — cookie pre-auth (corta vida): el segundo paso la valida en /login/2fa.
const issuePre2fa = (res, user, remember, returnTo) => {
    const t = JWT.sign(
        { id: user.id, twofa_pending: true, remember: !!remember, returnTo: returnTo || null },
        process.env.JWT_SECRET, { expiresIn: '5m' }
    );
    res.cookie('pre2fa', t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000 });
};
// #2 2FA obligatorio: cookie pre-auth de ENROLAMIENTO (admin/sup sin 2FA). No hay sesión completa
// hasta configurar el 2FA en /login/2fa/setup; si no lo completa, no queda logueado.
const issuePre2faSetup = (res, user, remember, returnTo) => {
    const t = JWT.sign(
        { id: user.id, twofa_setup_pending: true, remember: !!remember, returnTo: returnTo || null },
        process.env.JWT_SECRET, { expiresIn: '15m' }
    );
    res.cookie('pre2fa_setup', t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 15 * 60 * 1000 });
};
// ¿El equipo está marcado como de confianza (cookie td vigente)? Permite saltear el 2FA.
const isTrustedDevice = async (req, userId) => {
    const tok = req.cookies?.td;
    if (!tok) { return false; }
    const row = await trustedDeviceModel.findValid(userId, sha256(tok)).catch(() => null);
    return !!row;
};

// Arma el JWT de sesión (incluye el flag de cambio de contraseña pendiente) y lo setea
// como cookie httpOnly. Reutilizado por el login y por el cambio de contraseña forzado.
const buildToken = async (user, remember) => {
    const branch = user.branchId ? await branchModel.getById(user.branchId) : null;
    return JWT.sign(
        {
            id: user.id,
            email: user.email,
            roleId: user.roleId,
            fullName: user.fullName,
            branchId: user.branchId ?? null,
            branch: branch ? { id: user.branchId, latitude: branch.latitude, longitude: branch.longitude } : null,
            mustChangePassword: !!user.mustChangePassword,
            twoFactorEnabled: !!user.twoFactorEnabled,
            hasAvatar: !!user.avatar,
        },
        process.env.JWT_SECRET,
        { expiresIn: remember ? '30d' : '8h' }
    );
};
const setAuthCookie = (res, token, remember) => {
    const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
    };
    if (remember) { cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; }
    res.cookie('token', token, cookieOptions);
};

// Cuentas de prueba del login: se arman dinámicamente desde los usuarios activos
// en base (agrupadas por rol), así siempre reflejan lo que hay realmente.
const ROLE_LABEL = {
    [RoleType.SUPERVISOR.id]: 'Supervisor',
    [RoleType.OPERATOR.id]:   'Operador',
    [RoleType.DELIVERY.id]:   'Repartidor',
    [RoleType.ADMIN.id]:      'Administrador',
};
const ROLE_ORDER = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.DELIVERY.id, RoleType.ADMIN.id];

const buildDevAccounts = async () => {
    try {
        const { User } = require('../models/user');
        const users = await User.findAll({
            where: { active: true },
            attributes: ['email', 'fullName', 'roleId'],
            order: [['roleId', 'ASC'], ['fullName', 'ASC']],
        });
        return ROLE_ORDER
            .map((id) => ({
                label: ROLE_LABEL[id] || 'Otros',
                accounts: users
                    .filter((u) => u.roleId === id && u.email)
                    .map((u) => ({ email: u.email, name: u.fullName || u.email })),
            }))
            .filter((g) => g.accounts.length > 0);
    } catch (e) {
        console.error('[login] no se pudieron cargar cuentas de prueba:', e.message);
        return [];
    }
};

const getLogin = async (req, res) => {
    if (req.cookies?.token) {
        try {
            require('jsonwebtoken').verify(req.cookies.token, process.env.JWT_SECRET);
            return res.redirect('/home');
        } catch {
            res.clearCookie('token');
        }
    }
    const settingModel = require('../models/setting');
    const [nombreEmpresa, logoEmpresa] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('logo_empresa'),
    ]);
    const returnTo = req.query.returnTo || '';
    const devAccounts = await buildDevAccounts();
    return res.render('login', { returnTo, devAccounts, nombreEmpresa: nombreEmpresa || 'LogiTrack', logoEmpresa: logoEmpresa || '/images/logo.png' });
};

const login = async (req, res) => {
    const settingModel = require('../models/setting');
    const [nombreEmpresaRaw, logoEmpresaRaw] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('logo_empresa'),
    ]);
    const nombreEmpresa = nombreEmpresaRaw || 'LogiTrack';
    const logoEmpresa   = logoEmpresaRaw || '/images/logo.png';
    const {email, password} = req.body;

    const user = await userModel.findByEmail(email);
    if(!user){
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts() });
    }

    const match = await bcrypt.compare(password, user.password);
    if(!match){
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts() });
    }

    const remember = !!req.body.remember;
    const rawReturn = req.body.returnTo;
    const returnTo  = typeof rawReturn === 'string' ? rawReturn : (Array.isArray(rawReturn) ? rawReturn[0] : null);
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;

    // #1 Primer ingreso: contraseña temporal → primero el cambio (el usuario nuevo no tiene 2FA aún).
    if (user.mustChangePassword) {
        setAuthCookie(res, await buildToken(user, remember), remember);
        return res.redirect('/account/password/forced');
    }

    // #2 2FA: habilitado y equipo no confiable → pedir el segundo factor (sesión recién al validarlo).
    if (user.twoFactorEnabled && !(await isTrustedDevice(req, user.id))) {
        issuePre2fa(res, user, remember, safeReturn);
        return res.redirect('/login/2fa');
    }

    // #2 2FA obligatorio (admin/supervisor) sin enrolar → enrolamiento estilo login, SIN sesión
    // hasta completarlo. Si no lo termina, no queda logueado.
    if ([RoleType.SUPERVISOR.id, RoleType.ADMIN.id].includes(user.roleId) && !user.twoFactorEnabled) {
        issuePre2faSetup(res, user, remember, safeReturn);
        return res.redirect('/login/2fa/setup');
    }

    setAuthCookie(res, await buildToken(user, remember), remember);
    res.redirect(safeReturn || (user.roleId === 3 ? '/delivery' : '/home'));
};

const logout = (req, res) => {
    res.clearCookie('token');
    res.clearCookie('pre2fa');
    res.clearCookie('pre2fa_setup');
    res.clearCookie('tfaNudge');
    return res.redirect('/login');
};

module.exports = { getLogin, login, logout, buildToken, setAuthCookie, issuePre2faSetup };