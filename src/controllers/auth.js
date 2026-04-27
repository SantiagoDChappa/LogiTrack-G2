const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const userModel = require('../models/user');

const getLogin = (req, res) => {
    if (req.cookies?.token) {
        try {
            require('jsonwebtoken').verify(req.cookies.token, process.env.JWT_SECRET);
            return res.redirect('/home');
        } catch {
            res.clearCookie('token');
        }
    }
    return res.render('login');
};

const login = async (req, res) => {
    const {email, password} = req.body;

    const user = await userModel.findByEmail(email);
    if(!user){
        return res.render('login', { error: 'Email o contraseña incorrectos'});
    }

    const match = await bcrypt.compare(password, user.password);
    if(!match){
        return res.render('login', { error: 'Email o contraseña incorrectos'});
    }

    const token = JWT.sign(
        {id: user.id, email: user.email, roleId: user.roleId, fullName: user.fullName},
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
    res.redirect(user.roleId === 3 ? '/delivery' : '/home');
};

const logout = (req, res) => {
    res.clearCookie('token');
    return res.redirect('/login');
};

module.exports = { getLogin, login, logout };