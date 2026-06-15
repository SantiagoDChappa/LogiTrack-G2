const express = require('express');
const router = express.Router();
const c = require('../controllers/notificationInApp');

// Centro de notificaciones in-app del usuario logueado (LGT-218).
router.get('/', c.page);              // página completa "Notificaciones"
router.get('/data', c.dropdownData);  // JSON para la campana (contador + últimas)
router.post('/read-all', c.markAllRead);
router.post('/:id/read', c.markRead); // marcar una como leída (campana)
router.get('/:id/go', c.openAndGo);   // marcar leída + navegar al recurso

module.exports = router;
