const express = require('express');
const router = express.Router();
const { getForcedPasswordChange, postForcedPasswordChange, getProfile, postProfile, getAvatar, postChangePassword } = require('../controllers/account');
const { getSetup, postSetup, getManage, postDisable, postRegenerateBackup } = require('../controllers/twoFactor');

// Cambio de contraseña forzado (primer ingreso / reset por admin).
// Montado con requireAuth en app.js; el propio requireAuth redirige acá mientras
// el usuario tenga una contraseña temporal pendiente de cambio.
router.get('/password/forced',  getForcedPasswordChange);
router.post('/password/forced', postForcedPasswordChange);

// #2 2FA (TOTP) — enrolamiento y gestión del segundo factor.
router.get('/2fa',                    getManage);
router.get('/2fa/setup',              getSetup);
router.post('/2fa/setup',             postSetup);
router.post('/2fa/disable',           postDisable);
router.post('/2fa/backup/regenerate', postRegenerateBackup);

// Mi perfil (nombre, foto) + cambio de contraseña (valida 2FA si lo tiene).
router.get('/profile',          getProfile);
router.post('/profile',         postProfile);
router.get('/avatar/:id',       getAvatar);
router.post('/password/change', postChangePassword);

module.exports = router;
