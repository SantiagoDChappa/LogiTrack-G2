// Cuenta del usuario logueado: cambio de contraseña forzado (primer ingreso o reset
// por admin). El gate vive en middlewares/auth.requireAuth, que redirige acá mientras
// must_change_password siga true.
const bcrypt = require('bcryptjs');
const userModel = require('../models/user');
const { policyError } = require('../utils/password');
const { buildToken, setAuthCookie, issuePre2faSetup } = require('./auth');
const crypto = require('crypto');
const resetTokenModel = require('../models/passwordResetToken');
const { sendEmail } = require('../services/notification/emailSender');
const tfa = require('../services/twoFactorService');
const actionLogModel = require('../models/actionLog');

// Registro estándar de "cambio de contraseña" en el historial del usuario:
// nunca guarda el valor real, solo que ocurrió, quién lo hizo y cuándo.
const recordPasswordChange = (userId, req) =>
    actionLogModel.record(userId, 'UPDATE', 'USER', userId, { changes: [{ field: 'Contraseña', before: '(oculta)', after: '(cambiada)' }] }, req);

// Valida un segundo factor (TOTP o código de respaldo, que se consume). Devuelve true/false.
const verifySecondFactor = async (user, code) => {
    if (!user.twoFactorEnabled) { return true; }
    const secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    if (secret && tfa.verifyToken(code, secret)) { return true; }
    if (!code) { return false; }
    let list = [];
    try { list = user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes) : []; } catch { list = []; }
    const idx = await tfa.matchBackupCode(code, list);
    if (idx >= 0) {
        list.splice(idx, 1);
        await userModel.setBackupCodes(user.id, JSON.stringify(list));
        return true;
    }
    return false;
};

// #3 Recuperar contraseña — config del flujo de reset por email.
const RESET_TTL_MIN = 60;
const isDev = () => (process.env.NODE_ENV || 'development') !== 'production';
const appBaseUrl = () => process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const getForcedPasswordChange = (req, res) => {
    res.render('account/passwordForced', { error: null });
};

const postForcedPasswordChange = async (req, res) => {
    const userId = res.locals.currentUser?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const render = (error) => res.status(400).render('account/passwordForced', { error });

    const user = await userModel.getById(userId);
    if (!user) { return res.redirect('/logout'); }

    const okCurrent = await bcrypt.compare(String(currentPassword || ''), user.password);
    if (!okCurrent) { return render('La contraseña actual no es correcta.'); }
    if (!newPassword || newPassword !== confirmPassword) {
        return render('La nueva contraseña y su confirmación no coinciden.');
    }
    const perr = policyError(newPassword);
    if (perr) { return render(perr); }
    if (await bcrypt.compare(String(newPassword), user.password)) {
        return render('La nueva contraseña debe ser distinta de la actual.');
    }

    await userModel.setPassword(userId, newPassword);
    recordPasswordChange(userId, req);
    const fresh = await userModel.getById(userId);

    // #2 Si el rol exige 2FA y todavía no lo tiene, encadenar al enrolamiento (estilo login,
    // sin sesión completa) en vez de entrar directo a la app.
    const { RoleType } = require('../constants/enums');
    if ([RoleType.SUPERVISOR.id, RoleType.ADMIN.id].includes(fresh.roleId) && !fresh.twoFactorEnabled) {
        res.clearCookie('token');
        issuePre2faSetup(res, fresh, false, null);
        return res.redirect('/login/2fa/setup');
    }

    // Re-emitir la sesión sin el flag de cambio pendiente para no quedar en bucle.
    setAuthCookie(res, await buildToken(fresh, false), false);
    res.redirect(fresh.roleId === 3 ? '/delivery' : '/home');
};

// ── #3 Recuperar contraseña (rutas públicas, sin login) ───────────────────────

const getForgot = (req, res) => res.render('account/forgot', { sent: false, error: null, devLink: null });

const postForgot = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    let devLink = null;
    try {
        const user = email ? await userModel.findByEmail(email) : null;
        if (user && user.active) {
            await resetTokenModel.invalidateForUser(user.id);
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
            await resetTokenModel.create({ userId: user.id, tokenHash: sha256(token), expiresAt });
            const link = `${appBaseUrl()}/account/password/reset?token=${token}`;
            const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
                <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
                <p style="color:#64748b;margin-top:0">Recuperación de contraseña</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
                <p style="font-size:15px;color:#1e293b">Recibimos un pedido para restablecer tu contraseña. El enlace vence en ${RESET_TTL_MIN} minutos y es de un solo uso.</p>
                <p style="margin:20px 0"><a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">Restablecer contraseña</a></p>
                <p style="font-size:13px;color:#64748b">Si no fuiste vos, ignorá este mail; tu contraseña no cambia.</p>
            </div>`;
            const delivered = await sendEmail(user.email, 'Restablecer tu contraseña — LogiTrack', html, 'html').catch(() => false);
            if (isDev() && !delivered) { devLink = link; }
        }
    } catch (e) {
        console.error('[account] forgot:', e.message);
    }
    // Respuesta SIEMPRE genérica (anti-enumeración de usuarios).
    res.render('account/forgot', { sent: true, error: null, devLink });
};

const getReset = async (req, res) => {
    const token = String(req.query.token || '');
    const row = token ? await resetTokenModel.findValidByHash(sha256(token)).catch(() => null) : null;
    if (!row) {
        return res.status(400).render('account/reset', { token: null, done: false, error: 'El enlace es inválido o expiró. Pedí uno nuevo.', needs2fa: false });
    }
    const user = await userModel.getById(row.userId);
    res.render('account/reset', { token, done: false, error: null, needs2fa: !!(user && user.twoFactorEnabled) });
};

const postReset = async (req, res) => {
    const token = String(req.body.token || '');
    const { newPassword, confirmPassword, code2fa } = req.body;
    const row = token ? await resetTokenModel.findValidByHash(sha256(token)).catch(() => null) : null;
    if (!row) {
        return res.status(400).render('account/reset', { token: null, done: false, error: 'El enlace es inválido o expiró. Pedí uno nuevo.', needs2fa: false });
    }
    const user = await userModel.getById(row.userId);
    const needs2fa = !!(user && user.twoFactorEnabled);
    const back = (error) => res.status(400).render('account/reset', { token, done: false, error, needs2fa });

    // Si tiene 2FA, validarlo antes de permitir el cambio (el link del mail no alcanza solo).
    if (needs2fa && !(await verifySecondFactor(user, code2fa))) {
        return back('Código de verificación (2FA) incorrecto.');
    }
    if (!newPassword || newPassword !== confirmPassword) {
        return back('La contraseña y su confirmación no coinciden.');
    }
    const perr = policyError(newPassword);
    if (perr) { return back(perr); }

    await userModel.setPassword(row.userId, newPassword);
    recordPasswordChange(row.userId, req);
    await resetTokenModel.markUsed(row.id);
    await resetTokenModel.invalidateForUser(row.userId);
    res.render('account/reset', { token: null, done: true, error: null, needs2fa: false });
};

// ── Mi perfil (nombre, foto, cambio de contraseña con 2FA) ─────────────────────

const getProfile = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    res.render('account/profile', { user, twoFactorEnabled: user.twoFactorEnabled, ok: req.query.ok || null, error: null, pwError: null });
};

const postProfile = async (req, res) => {
    const userId = res.locals.currentUser.id;
    const user = await userModel.getById(userId);
    const fullName = String(req.body.fullName || '').trim().slice(0, 100);
    const avatar = req.body.avatar;
    if (!fullName) {
        return res.status(400).render('account/profile', { user, twoFactorEnabled: user.twoFactorEnabled, ok: null, error: 'El nombre es obligatorio.', pwError: null });
    }
    const update = { fullName };
    if (avatar === '__REMOVE__') {
        update.avatar = null;
    } else if (typeof avatar === 'string' && avatar.startsWith('data:image/')) {
        if (avatar.length > 900000) {
            return res.status(400).render('account/profile', { user, twoFactorEnabled: user.twoFactorEnabled, ok: null, error: 'La imagen es muy grande. Probá con una más chica.', pwError: null });
        }
        update.avatar = avatar;
    }
    await userModel.updateProfile(userId, update);
    // Re-emitir la sesión: nombre y presencia de foto van en el token (se ven en el header).
    const fresh = await userModel.getById(userId);
    setAuthCookie(res, await buildToken(fresh, false), false);
    res.redirect('/account/profile?ok=profile');
};

const getAvatar = async (req, res) => {
    const user = await userModel.getById(Number(req.params.id));
    const m = user && user.avatar ? String(user.avatar).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/) : null;
    if (!m) { return res.status(404).end(); }
    res.set('Content-Type', m[1]);
    res.set('Cache-Control', 'private, max-age=60');
    res.end(Buffer.from(m[2], 'base64'));
};

const postChangePassword = async (req, res) => {
    const userId = res.locals.currentUser.id;
    const user = await userModel.getById(userId);
    const { currentPassword, newPassword, confirmPassword, token } = req.body;
    const back = (pwError) => res.status(400).render('account/profile', { user, twoFactorEnabled: user.twoFactorEnabled, ok: null, error: null, pwError });

    if (!(await bcrypt.compare(String(currentPassword || ''), user.password))) { return back('La contraseña actual no es correcta.'); }
    if (!(await verifySecondFactor(user, token))) { return back('Código de verificación (2FA) incorrecto.'); }
    if (!newPassword || newPassword !== confirmPassword) { return back('La nueva contraseña y su confirmación no coinciden.'); }
    const perr = policyError(newPassword);
    if (perr) { return back(perr); }
    if (await bcrypt.compare(String(newPassword), user.password)) { return back('La nueva contraseña debe ser distinta de la actual.'); }

    await userModel.setPassword(userId, newPassword);
    recordPasswordChange(userId, req);
    const fresh = await userModel.getById(userId);
    setAuthCookie(res, await buildToken(fresh, false), false);
    res.redirect('/account/profile?ok=password');
};

module.exports = {
    getForcedPasswordChange, postForcedPasswordChange,
    getForgot, postForgot, getReset, postReset,
    getProfile, postProfile, getAvatar, postChangePassword,
};
