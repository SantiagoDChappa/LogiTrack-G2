const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const userModel = require('../models/user');
const branchModel = require('../models/branch');

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
    return res.render('login', { returnTo, nombreEmpresa: nombreEmpresa || 'LogiTrack', logoEmpresa: logoEmpresa || '/images/logo.png' });
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
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa });
    }

    const match = await bcrypt.compare(password, user.password);
    if(!match){
        return res.render('login', { error: 'Email o contraseña incorrectos', nombreEmpresa, logoEmpresa });
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
    const rawReturn = req.body.returnTo;
    const returnTo  = typeof rawReturn === 'string' ? rawReturn : (Array.isArray(rawReturn) ? rawReturn[0] : null);
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;
    res.redirect(safeReturn || (user.roleId === 3 ? '/delivery' : '/home'));
};

const logout = (req, res) => {
    res.clearCookie('token');
    return res.redirect('/login');
};

module.exports = { getLogin, login, logout };