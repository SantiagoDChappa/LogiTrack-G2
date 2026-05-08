'use strict';

const express      = require('express');
const router       = express.Router();
const routePlanner = require('../../services/routePlanner');

// GET /api/route?originLat=&originLng=&originLabel=&destLat=&destLng=&destLabel=&originBranchId=
router.get('/', async (req, res) => {
    const { originLat, originLng, originLabel, destLat, destLng, destLabel, originBranchId } = req.query;
    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
        return res.json({ route: null });
    }

    try {
        const route = await routePlanner.planShipmentRoute({
            origin:         { lat: oLat, lng: oLng, label: originLabel || 'Origen' },
            destination:    { lat: dLat, lng: dLng, label: destLabel   || 'Destino' },
            originBranchId: originBranchId ? Number(originBranchId) : null,
        });
        res.json({ route });
    } catch (err) {
        console.error('ERROR /api/route:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
