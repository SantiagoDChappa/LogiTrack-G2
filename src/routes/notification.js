const express = require('express');
const router = express.Router();
const { listEmails, sendPending, toggleAutoSend } = require('../controllers/notification');

// /notification/fallidas — tabla de notificaciones por email (estado + historial).
router.get('/fallidas', listEmails);
// Envío manual de la cola (no depende del kill-switch) + toggle del envío automático.
router.post('/send-pending', sendPending);
router.post('/auto-toggle',  toggleAutoSend);
// alias raíz por comodidad
router.get('/', (req, res) => res.redirect('/notification/fallidas'));

module.exports = router;
