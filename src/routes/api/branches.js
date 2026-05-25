const express = require('express');
const router  = express.Router();
const branchModel = require('../../models/branch');
const { resolveZone } = require('../../services/zoneResolver.service');

// GET /api/branches/pickup?zoneId=... | ?provinceId=... | ?postalCode=...
router.get('/pickup', async (req, res) => {
    try {
        const { zoneId, postalCode } = req.query;
        let provinceId = req.query.provinceId ? Number(req.query.provinceId) : null;

        if (!provinceId && zoneId) {
            const { Zone } = require('../../models/zone');
            const zone = await Zone.findByPk(Number(zoneId));
            if (zone?.provinceId) { provinceId = zone.provinceId; }
        }
        if (!provinceId && postalCode) {
            const zone = await resolveZone({ postalCode, provinceId: null });
            if (zone?.provinceId) { provinceId = zone.provinceId; }
        }

        const branches = await branchModel.getPickupEnabled({ provinceId });
        res.json(branches.map(b => ({
            id:         b.id,
            name:       b.name,
            address:    b.address,
            postalCode: b.postalCode,
            provinceId: b.provinceId,
            phone:      b.phone,
            latitude:   b.latitude,
            longitude:  b.longitude,
        })));
    } catch (err) {
        console.error('ERROR /api/branches/pickup:', err.message);
        res.status(500).json({ error: 'Error obteniendo sucursales' });
    }
});

module.exports = router;
