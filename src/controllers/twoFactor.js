// #2 2FA (TOTP) — enrolamiento/gestión (usuario logueado) y verificación en el login.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const userModel = require('../models/user');
const trustedDeviceModel = require('../models/trustedDevice');
const tfa = require('../services/twoFactorService');
const { buildToken, setAuthCookie } = require('./auth');

const PRE2FA_COOKIE = 'pre2fa';
const TD_COOKIE = 'td';
const TD_TTL_DAYS = 30;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const backupRemaining = (user) => {
    try { return user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes).length : 0; } catch { return 0; }
};

// ── Enrolamiento / gestión (requiere sesión) ───────────────────────────────────

const getSetup = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    if (user.twoFactorEnabled) { return res.redirect('/account/2fa'); }
    // Genera (o reutiliza) un secreto pendiente, lo guarda cifrado y muestra el QR.
    let secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    if (!secret) {
        secret = tfa.generateSecret();
        await userModel.setTwoFactorPending(user.id, tfa.encrypt(secret));
    }
    const qrDataUrl = await QRCode.toDataURL(tfa.otpauthUrl(user.email, secret)).catch(() => null);
    res.render('account/twoFactorSetup', { qrDataUrl, secret, error: null });
};

const postSetup = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    if (user.twoFactorEnabled) { return res.redirect('/account/2fa'); }
    const secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    const reRender = async (error) => {
        const qrDataUrl = secret ? await QRCode.toDataURL(tfa.otpauthUrl(user.email, secret)).catch(() => null) : null;
        return res.status(400).render('account/twoFactorSetup', { qrDataUrl, secret, error });
    };
    if (!secret) { return reRender('No se pudo leer el secreto. Recargá la página.'); }
    if (!tfa.verifyToken(req.body.token, secret)) { return reRender('Código incorrecto. Revisá la hora del dispositivo y probá de nuevo.'); }

    const { plain, hashed } = await tfa.generateBackupCodes(10);
    await userModel.enableTwoFactor(user.id, JSON.stringify(hashed));

    // Re-emitir la sesión con twoFactorEnabled=true para que el gate no vuelva a forzar el setup.
    const fresh = await userModel.getById(user.id);
    setAuthCookie(res, await buildToken(fresh, false), false);

    res.render('account/twoFactorBackup', { codes: plain, context: 'enabled' });
};

const getManage = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    res.render('account/twoFactorManage', {
        enabled: user.twoFactorEnabled,
        remaining: backupRemaining(user),
        error: null,
        ok: req.query.ok || null,
    });
};

const postDisable = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    const okPass = await bcrypt.compare(String(req.body.password || ''), user.password);
    if (!okPass) {
        return res.status(400).render('account/twoFactorManage', {
            enabled: user.twoFactorEnabled, remaining: backupRemaining(user),
            error: 'Contraseña incorrecta.', ok: null,
        });
    }
    await userModel.disableTwoFactor(user.id);
    await trustedDeviceModel.removeForUser(user.id);
    const fresh = await userModel.getById(user.id);
    setAuthCookie(res, await buildToken(fresh, false), false);
    res.redirect('/account/2fa?ok=disabled');
};

const postRegenerateBackup = async (req, res) => {
    const user = await userModel.getById(res.locals.currentUser.id);
    if (!user.twoFactorEnabled) { return res.redirect('/account/2fa'); }
    const { plain, hashed } = await tfa.generateBackupCodes(10);
    await userModel.setBackupCodes(user.id, JSON.stringify(hashed));
    res.render('account/twoFactorBackup', { codes: plain, context: 'regenerated' });
};

// ── Verificación en el login (pre-auth con cookie pre2fa) ───────────────────────

function verifyPre(req) {
    const t = req.cookies?.[PRE2FA_COOKIE];
    if (!t) { return null; }
    try {
        const d = jwt.verify(t, process.env.JWT_SECRET);
        return d && d.twofa_pending ? d : null;
    } catch { return null; }
}

const getLoginVerify = (req, res) => {
    if (!verifyPre(req)) { return res.redirect('/login'); }
    res.render('login2fa', { error: null, nombreEmpresa: 'LogiTrack' });
};

const postLoginVerify = async (req, res) => {
    const pre = verifyPre(req);
    if (!pre) { return res.redirect('/login'); }
    const user = await userModel.getById(pre.id);
    if (!user || !user.twoFactorEnabled) { return res.redirect('/login'); }

    const secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    let okFactor = !!(secret && tfa.verifyToken(req.body.token, secret));

    // Si no fue un TOTP válido, probar como código de respaldo (un solo uso).
    if (!okFactor && req.body.token) {
        let list = [];
        try { list = user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes) : []; } catch { list = []; }
        const idx = await tfa.matchBackupCode(req.body.token, list);
        if (idx >= 0) {
            okFactor = true;
            list.splice(idx, 1);
            await userModel.setBackupCodes(user.id, JSON.stringify(list));
        }
    }
    if (!okFactor) {
        return res.status(400).render('login2fa', { error: 'Código incorrecto.', nombreEmpresa: 'LogiTrack' });
    }

    // "Recordar este dispositivo 30 días": guarda token de confianza.
    if (req.body.remember_device === 'on' || req.body.remember_device === 'true') {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + TD_TTL_DAYS * 24 * 60 * 60 * 1000);
        await trustedDeviceModel.create({ userId: user.id, tokenHash: sha256(token), expiresAt, userAgent: req.get('user-agent') });
        res.cookie(TD_COOKIE, token, {
            httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
            maxAge: TD_TTL_DAYS * 24 * 60 * 60 * 1000,
        });
    }

    res.clearCookie(PRE2FA_COOKIE);
    setAuthCookie(res, await buildToken(user, !!pre.remember), !!pre.remember);
    const safe = typeof pre.returnTo === 'string' && pre.returnTo.startsWith('/') && !pre.returnTo.startsWith('//') ? pre.returnTo : null;
    res.redirect(safe || (user.roleId === 3 ? '/delivery' : '/home'));
};

// ── Enrolamiento OBLIGATORIO en el login (pre-auth, estilo login, sin sesión completa) ──
// El usuario admin/supervisor sin 2FA no queda logueado: primero configura el 2FA.
const SETUP_PRE_COOKIE = 'pre2fa_setup';
function verifyPreSetup(req) {
    const t = req.cookies?.[SETUP_PRE_COOKIE];
    if (!t) { return null; }
    try {
        const d = jwt.verify(t, process.env.JWT_SECRET);
        return d && d.twofa_setup_pending ? d : null;
    } catch { return null; }
}

const getLoginSetup = async (req, res) => {
    const pre = verifyPreSetup(req);
    if (!pre) { return res.redirect('/login'); }
    const user = await userModel.getById(pre.id);
    if (!user) { return res.redirect('/login'); }
    if (user.twoFactorEnabled) { return res.redirect('/login'); }
    let secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    if (!secret) {
        secret = tfa.generateSecret();
        await userModel.setTwoFactorPending(user.id, tfa.encrypt(secret));
    }
    const qrDataUrl = await QRCode.toDataURL(tfa.otpauthUrl(user.email, secret)).catch(() => null);
    res.render('login2faSetup', { qrDataUrl, secret, error: null });
};

const postLoginSetup = async (req, res) => {
    const pre = verifyPreSetup(req);
    if (!pre) { return res.redirect('/login'); }
    const user = await userModel.getById(pre.id);
    if (!user) { return res.redirect('/login'); }
    const secret = user.twoFactorSecret ? tfa.decrypt(user.twoFactorSecret) : null;
    const reRender = async (error) => {
        const qrDataUrl = secret ? await QRCode.toDataURL(tfa.otpauthUrl(user.email, secret)).catch(() => null) : null;
        return res.status(400).render('login2faSetup', { qrDataUrl, secret, error });
    };
    if (!secret) { return reRender('No se pudo leer el secreto. Recargá la página.'); }
    if (!tfa.verifyToken(req.body.token, secret)) { return reRender('Código incorrecto. Revisá la hora del dispositivo y probá de nuevo.'); }

    const { plain, hashed } = await tfa.generateBackupCodes(10);
    await userModel.enableTwoFactor(user.id, JSON.stringify(hashed));

    // Recién acá se otorga la sesión completa.
    const fresh = await userModel.getById(user.id);
    res.clearCookie(SETUP_PRE_COOKIE);
    setAuthCookie(res, await buildToken(fresh, !!pre.remember), !!pre.remember);
    res.render('login2faBackup', { codes: plain });
};

module.exports = {
    getSetup, postSetup, getManage, postDisable, postRegenerateBackup,
    getLoginVerify, postLoginVerify,
    getLoginSetup, postLoginSetup,
};
