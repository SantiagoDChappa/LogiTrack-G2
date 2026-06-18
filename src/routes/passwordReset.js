const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getForgot, postForgot, getReset, postReset } = require('../controllers/account');

// #3 Recuperar contraseña — rutas PÚBLICAS (el usuario olvidó su contraseña).
// Montadas en /account/password ANTES del /account protegido (ver app.js).
// Rate-limit del pedido para evitar abuso / enumeración por fuerza bruta.
const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiados intentos. Probá de nuevo en unos minutos.',
});

router.get('/forgot',  getForgot);
router.post('/forgot', forgotLimiter, postForgot);
router.get('/reset',   getReset);
router.post('/reset',  postReset);

module.exports = router;
