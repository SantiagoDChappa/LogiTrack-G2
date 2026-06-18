const express = require('express');
const router = express.Router();
const sequelize = require('../../database/connection');

// /api/health: chequeo completo (incluye DB). Para monitoring.
router.get('/', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: 'ok', database: 'connected' });
    } catch {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// /api/health/ping: chequeo liviano (sin DB). Endpoint barato para uptime cron
// externo que evita cold start en Render free (UptimeRobot, cron-job.org, etc.).
router.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

module.exports = router;
