const JWT = require('jsonwebtoken');
const userModel = require('../models/user');
const enums = require('../constants/enums');

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token;

    if(!token){
        return res.redirect('/login');
    }

    try {
        const payload = JWT.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        res.locals.currentUser = await userModel.getById(payload.id);
        res.locals.currentUser.getAccess = res.locals.currentUser.roleId === enums.RoleType.SUPERVISOR.id;
        res.setHeader('Cache-Control', 'no-store');
        next();
    } catch (_err) {
        res.clearCookie('token');
        res.redirect('/login');
    }
};

const requireSupervisor = (req, res, next) => {
    const user = res.locals.currentUser;
    if (user.roleId !== enums.RoleType.SUPERVISOR.id) {
        return res.redirect('/');
    }
    next();
};

const requireDelivery = (req, res, next) => {
    const user = res.locals.currentUser;
    if (user.roleId !== enums.RoleType.DELIVERY.id) {
        return res.redirect('/');
    }
    next();
};

module.exports = { requireAuth, requireSupervisor, requireDelivery };
