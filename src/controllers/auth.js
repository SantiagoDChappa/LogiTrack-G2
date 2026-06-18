const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const userModel = require('../models/user');
const branchModel = require('../models/branch');
const { RoleType } = require('../constants/enums');
const loginLogModel = require('../models/loginLog');

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

    const match = await bcrypt.compare(password, user.password);
    if(!match){
        loginLogModel.record(null, 'LOGIN_FAILED', req, email);
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa, devAccounts: await buildDevAccounts() });
    }

    const branch = user.branchId ? await branchModel.getById(user.branchId) : null;

    const token = JWT.sign(
        {
            id: user.id,
            email: user.email,
            roleId: user.roleId,
            fullName: user.fullName,
            branchId: user.branchId ?? null,
            branch: branch ? { id: user.branchId, latitude: branch.latitude, longitude: branch.longitude } : null,
        },
        process.env.JWT_SECRET,
        {expiresIn: req.body.remember ? '30d' : '8h'}
    );

    const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
    };
    if (req.body.remember) {
        cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    }
    res.cookie('token', token, cookieOptions);
    loginLogModel.record(user.id, 'LOGIN', req);
    const rawReturn = req.body.returnTo;
    const returnTo  = typeof rawReturn === 'string' ? rawReturn : (Array.isArray(rawReturn) ? rawReturn[0] : null);
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;
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
    return res.redirect('/login');
};

module.exports = { getLogin, login, logout };