const express = require('express');
const router = express.Router();
const zoneGeo = require('../../services/zoneGeo.service');

// Resumen de zonas agregadas por provincia para el mapa del admin de zonas.
router.get('/summary', async (req, res) => {
    try {
        const data = await zoneGeo.getProvinceSummary();
        res.json(data);
    } catch (err) {
        console.error('[zones-geo] summary error:', err.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen de zonas' });
    }
});

module.exports = router;
