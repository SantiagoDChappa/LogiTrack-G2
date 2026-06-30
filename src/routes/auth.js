const express = require('express');
const router = express.Router();
const { getLogin, login, logout } = require('../controllers/auth.js');
const { getLoginVerify, postLoginVerify, getLoginSetup, postLoginSetup } = require('../controllers/twoFactor.js');

router.get('/login', getLogin);
router.post('/login', login);
// #2 2FA — segundo paso del login (pre-auth via cookie pre2fa).
router.get('/login/2fa',  getLoginVerify);
router.post('/login/2fa', postLoginVerify);
// #2 2FA — enrolamiento OBLIGATORIO estilo login (pre-auth via cookie pre2fa_setup).
router.get('/login/2fa/setup',  getLoginSetup);
router.post('/login/2fa/setup', postLoginSetup);
router.get('/logout', logout);

module.exports = router;