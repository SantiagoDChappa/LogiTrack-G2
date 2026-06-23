// Overrides estéticos de la delimitación de partidos en el mapa de zonas.
// GET lista (para aplicar al dibujar), PUT guarda/actualiza uno (supervisor).
// Tolera tabla inexistente (migración 091 sin correr): GET devuelve lista vacía.
const express = require('express');
const router = express.Router();
const { requireSupervisor } = require('../../middlewares/auth');
const DepartamentoGeomOverride = require('../../models/departamentoGeomOverride');

router.get('/', async (req, res) => {
    try {
        const rows = await DepartamentoGeomOverride.findAll();
        res.json({ ok: true, overrides: rows.map(r => ({ code: r.code, geom: r.geom })) });
    } catch (e) {
        console.warn('[dept-overrides] list:', e.message);
        res.json({ ok: true, overrides: [] });
    }
});

router.put('/:code', requireSupervisor, async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        const { geom } = req.body || {};
        if (!code) { return res.status(400).json({ ok: false, error: 'Falta el código del partido' }); }
        if (!geom || !geom.type) { return res.status(400).json({ ok: false, error: 'Geometría inválida' }); }
        const [row, created] = await DepartamentoGeomOverride.upsert({
            code, geom, updatedBy: res.locals.currentUser?.id || null, updatedAt: new Date(),
        }, { returning: true });
        res.json({ ok: true, created: !!created, code: row?.code || code });
    } catch (e) {
        console.error('[dept-overrides] put:', e.message);
        res.status(500).json({ ok: false, error: 'No se pudo guardar la delimitación' });
    }
});

module.exports = router;
