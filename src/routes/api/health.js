const express = require('express');
const router = express.Router();
const sequelize = require('../../database/connection');

router.get('/', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: 'ok', database: 'connected' });
    } catch {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

module.exports = router;
