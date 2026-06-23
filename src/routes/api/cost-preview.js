// Preview del costo del envío durante el alta: con los datos cargados (zona por
// provincia/CP + peso + volumen) devuelve el desglose y total ANTES de confirmar.
// Reutiliza el mismo cálculo que persiste el envío (shipmentCostService).
const express = require('express');
const router = express.Router();
const { resolveZone } = require('../../services/zoneResolver.service');
const costSvc = require('../../services/shipmentCostService');

router.post('/', async (req, res) => {
    try {
        const { provinceId, postalCode, weightKg, volumeM3, declaredValue, lat, lng } = req.body;
        const zone = await resolveZone({
            postalCode,
            provinceId: provinceId ? Number(provinceId) : null,
        });
        const pseudoShipment = {
            zone,
            weightKg: Number(weightKg) || 0,
            volumeM3: Number(volumeM3) || 0,
            // [prototype] seguro de mercadería: el % global se aplica sobre el valor declarado.
            declaredValue: Number(declaredValue) || 0,
            // Destino para evaluar zona peligrosa (lat/long primero, CP de respaldo).
            destPostalCode: postalCode || null,
            destLat: lat !== null && lat !== undefined && lat !== '' ? Number(lat) : null,
            destLng: lng !== null && lng !== undefined && lng !== '' ? Number(lng) : null,
        };
        const breakdown = await costSvc.computeCost(pseudoShipment);
        if (!breakdown) { return res.json({ ok: false }); }
        res.json({
            ok: true,
            breakdown,
            zoneName: zone?.name || null,
            // El front puede avisar / bloquear si el destino no es operable.
            danger: { dangerous: !!breakdown.dangerous, reachable: breakdown.reachable !== false },
        });
    } catch (e) {
        console.error('[cost-preview]', e.message);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;
