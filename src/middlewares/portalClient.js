const {
    COOKIE_NAME,
    verifyPortalClientSession,
} = require('../services/portalClientAccess');

const requirePortalClient = (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    const returnTo = '/portal/mis-envios?returnTo=' + encodeURIComponent(req.originalUrl);
    if (!token) {
        return res.redirect(returnTo);
    }

    const client = verifyPortalClientSession(token);
    if (!client) {
        res.clearCookie(COOKIE_NAME);
        return res.redirect(returnTo);
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
