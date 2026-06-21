const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const userModel = require('../models/user');
const branchModel = require('../models/branch');
const { RoleType } = require('../constants/enums');
const loginLogModel = require('../models/loginLog');
const crypto = require('crypto');
const trustedDeviceModel = require('../models/trustedDevice');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const getIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'desconocida';

const appBaseUrl = () => process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const RESET_TTL_MIN = 60;

// #LGT-193 — alerta por mail al titular de la cuenta cuando se bloquea por intentos fallidos.
// Incluye un link de cambio de contraseña de un solo uso (mismo mecanismo que "Olvidé mi contraseña").
const sendLockoutEmail = async (user, ip, lockedUntil) => {
    try {
        const { sendEmail } = require('../services/notification/emailSender');
        const resetTokenModel = require('../models/passwordResetToken');

        await resetTokenModel.invalidateForUser(user.id);
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
        await resetTokenModel.create({ userId: user.id, tokenHash: sha256(token), expiresAt });
        const link = `${appBaseUrl()}/account/password/reset?token=${token}`;
        const unlockTime = new Date(lockedUntil).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        const subject = 'Alerta de seguridad: tu cuenta de LogiTrack fue bloqueada temporalmente';
        const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
            <h2 style="color:#dc2626;margin-bottom:4px">LogiTrack</h2>
            <p style="color:#64748b;margin-top:0">Alerta de seguridad</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
            <p style="font-size:15px;color:#1e293b">Hola ${user.fullName},</p>
            <p style="font-size:15px;color:#1e293b">Detectamos <strong>3 intentos fallidos</strong> de inicio de sesión en tu cuenta (${user.email}) desde la IP <strong>${ip}</strong>.</p>
            <p style="font-size:15px;color:#1e293b">Por seguridad, tu cuenta quedó <strong>bloqueada hasta las ${unlockTime}</strong>. Podrás volver a intentar ingresar a partir de esa hora.</p>
            <p style="margin:20px 0"><a href="${link}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">Cambiar mi contraseña</a></p>
            <p style="font-size:13px;color:#64748b">Si no fuiste vos quien intentó ingresar, cambiá tu contraseña con el botón de arriba o avisale a un administrador. El enlace vence en ${RESET_TTL_MIN} minutos y es de un solo uso.</p>
            <p style="font-size:13px;color:#64748b">Si fuiste vos, esperá hasta las ${unlockTime} y volvé a intentar con la contraseña correcta.</p>
        </div>`;
        await sendEmail(user.email, subject, html, 'html');
    } catch (e) {
        console.error('[login] error enviando alerta de bloqueo:', e.message);
    }
};

// #LGT-193 — si hay 2+ cuentas bloqueadas al mismo tiempo, puede ser un ataque
// coordinado (no solo un usuario que se equivocó de contraseña). Avisamos a los
// admins activos para que lo revisen en Auditoría.
const notifyAdminsSuspiciousActivity = async (lockedCount) => {
    try {
        const { sendEmail } = require('../services/notification/emailSender');
        const admins = await userModel.getActiveAdmins();
        // SendGrid rechaza el envío entero si hay un email duplicado en la lista
        // de destinatarios (puede pasar si dos cuentas activas comparten el mismo email).
        const emails = [...new Set(admins.map(a => a.email).filter(Boolean))];
        if (emails.length === 0) { return; }

        const subject = `Alerta de seguridad: ${lockedCount} cuentas bloqueadas simultáneamente en LogiTrack`;
        const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
            <h2 style="color:#dc2626;margin-bottom:4px">LogiTrack</h2>
            <p style="color:#64748b;margin-top:0">Alerta de seguridad</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
            <p style="font-size:15px;color:#1e293b">Hay <strong>${lockedCount} cuentas bloqueadas</strong> al mismo tiempo por intentos fallidos de login. Esto puede indicar un intento de acceso coordinado contra varias cuentas.</p>
            <p style="margin:20px 0"><a href="${appBaseUrl()}/auditoria" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">Revisar en Auditoría</a></p>
            <p style="font-size:13px;color:#64748b">Recibís este aviso porque sos administrador de LogiTrack.</p>
        </div>`;
        await sendEmail(emails, subject, html, 'html');
    } catch (e) {
        console.error('[login] error avisando a admins por actividad sospechosa:', e.message);
    }
};

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
        loginLogModel.record(null, 'LOGIN_FAILED', req, email);
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts() });
    }

    // Cuenta bloqueada por intentos fallidos previos: ni siquiera comparamos la contraseña.
    if (userModel.isLocked(user)) {
        const unlockTime = new Date(user.lockedUntil).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        loginLogModel.record(user.id, 'LOGIN_BLOCKED', req, email);
        return res.render('login', {
            error: `Tu cuenta está bloqueada por múltiples intentos fallidos. Vas a poder volver a intentar a partir de las ${unlockTime}.`,
            nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts(),
        });
    }

    const match = await bcrypt.compare(password, user.password);
    if(!match){
        loginLogModel.record(user.id, 'LOGIN_FAILED', req, email);
        const { locked, lockedUntil } = await userModel.registerFailedLogin(user.id);
        if (locked) {
            sendLockoutEmail(user, getIp(req), lockedUntil);
            userModel.countCurrentlyLocked().then(count => {
                if (count >= 2) { notifyAdminsSuspiciousActivity(count); }
            }).catch(() => {});
            const unlockTime = new Date(lockedUntil).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            return res.render('login', {
                error: `Detectamos 3 intentos fallidos. Por seguridad, tu cuenta quedó bloqueada hasta las ${unlockTime}. Te enviamos un mail con el detalle.`,
                nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts(),
            });
        }
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts() });
    }

    await userModel.resetFailedLogin(user.id);

    const remember = !!req.body.remember;
    loginLogModel.record(user.id, 'LOGIN', req);
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
    try {
        const token = req.cookies?.token;
        if (token) {
            const decoded = JWT.verify(token, process.env.JWT_SECRET);
            if (decoded?.id) { loginLogModel.record(decoded.id, 'LOGOUT', req); }
        }
    } catch { /* token inválido o expirado, igual hacemos logout */ }
    res.clearCookie('token');
    res.clearCookie('pre2fa');
    res.clearCookie('pre2fa_setup');
    res.clearCookie('tfaNudge');
    return res.redirect('/login');
};

module.exports = { getLogin, login, logout, buildToken, setAuthCookie, issuePre2faSetup };