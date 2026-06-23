// ABM de áreas peligrosas / no llegables para el mapa de zonas.
// GET lista (para pintar el overlay), POST crea (área dibujada o partido), DELETE quita.
const express = require('express');
const router = express.Router();
const { requireSupervisor } = require('../../middlewares/auth');
const dangerSvc = require('../../services/dangerArea.service');

router.get('/', async (req, res) => {
    try {
        const rows = await dangerSvc.list();
        res.json({ ok: true, areas: rows });
    } catch (e) {
        console.error('[danger-areas] list', e.message);
        res.status(500).json({ ok: false, error: 'No se pudieron cargar las áreas' });
    }
});

router.post('/', requireSupervisor, async (req, res) => {
    try {
        const { scope, code, name, reachable, geom, note } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ ok: false, error: 'Falta el nombre del área' });
        }
        // Una marca útil necesita geometría (lat/long) o un prefijo de CP.
        if (!geom && !code) {
            return res.status(400).json({ ok: false, error: 'El área necesita geometría o un prefijo de CP' });
        }
        const row = await dangerSvc.create({ scope, code, name: String(name).trim(), reachable, geom, note });
        res.status(201).json({ ok: true, area: row });
    } catch (e) {
        console.error('[danger-areas] create', e.message);
        res.status(500).json({ ok: false, error: 'No se pudo guardar el área' });
    }
});

router.delete('/:id', requireSupervisor, async (req, res) => {
    try {
        const n = await dangerSvc.remove(Number(req.params.id));
        res.json({ ok: true, removed: n });
    } catch (e) {
        console.error('[danger-areas] delete', e.message);
        res.status(500).json({ ok: false, error: 'No se pudo eliminar el área' });
    }
});

module.exports = router;
