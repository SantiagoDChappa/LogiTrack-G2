const express = require('express');
const router = express.Router();
const { listEmails } = require('../controllers/notification');

// /notification/fallidas — tabla de notificaciones por email (estado + historial).
router.get('/fallidas', listEmails);
// alias raíz por comodidad
router.get('/', (req, res) => res.redirect('/notification/fallidas'));

module.exports = router;
