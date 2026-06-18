// Preview del costo del envío durante el alta: con los datos cargados (zona por
// provincia/CP + peso + volumen) devuelve el desglose y total ANTES de confirmar.
// Reutiliza el mismo cálculo que persiste el envío (shipmentCostService).
const express = require('express');
const router = express.Router();
const { resolveZone } = require('../../services/zoneResolver.service');
const costSvc = require('../../services/shipmentCostService');

router.post('/', async (req, res) => {
    try {
        const { provinceId, postalCode, weightKg, volumeM3 } = req.body;
        const zone = await resolveZone({
            postalCode,
            provinceId: provinceId ? Number(provinceId) : null,
        });
        const pseudoShipment = {
            zone,
            weightKg: Number(weightKg) || 0,
            volumeM3: Number(volumeM3) || 0,
        };
        const breakdown = await costSvc.computeCost(pseudoShipment);
        if (!breakdown) { return res.json({ ok: false }); }
        res.json({ ok: true, breakdown, zoneName: zone?.name || null });
    } catch (e) {
        console.error('[cost-preview]', e.message);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;
