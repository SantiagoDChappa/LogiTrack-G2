const {
    COOKIE_NAME,
    verifyPortalClientSession,
} = require('../services/portalClientAccess');

const requirePortalClient = (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.redirect('/portal/mis-envios');
    }

    const client = verifyPortalClientSession(token);
    if (!client) {
        res.clearCookie(COOKIE_NAME);
        return res.redirect('/portal/mis-envios');
    }

    res.locals.portalClient = client;
    next();
};

const optionalPortalClient = (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
        const client = verifyPortalClientSession(token);
        if (client) {
            res.locals.portalClient = client;
        }
    }
    next();
};

module.exports = { requirePortalClient, optionalPortalClient, COOKIE_NAME };
