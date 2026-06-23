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

// Evalúa un destino (lat/long o CP) contra las áreas. Solo lectura (requireAuth a
// nivel app), la usa el alta de envío para avisar zona peligrosa / no llegable.
router.post('/check', async (req, res) => {
    try {
        const { postalCode, lat, lng } = req.body || {};
        const ev = await dangerSvc.evaluate({
            postalCode: postalCode || null,
            lat: lat !== undefined && lat !== null && lat !== '' ? Number(lat) : null,
            lng: lng !== undefined && lng !== null && lng !== '' ? Number(lng) : null,
        });
        res.json({
            ok: true,
            dangerous: ev.dangerous,
            reachable: ev.reachable,
            area: ev.area ? { id: ev.area.id, name: ev.area.name, note: ev.area.note, reachable: ev.area.reachable } : null,
        });
    } catch (e) {
        console.error('[danger-areas] check', e.message);
        res.status(500).json({ ok: false });
    }
});

// Edita un área (reformar delimitación o datos). Reusa el dibujo de Geoman.
router.put('/:id', requireSupervisor, async (req, res) => {
    try {
        const { scope, code, name, reachable, geom, note } = req.body || {};
        if (name !== undefined && !String(name).trim()) {
            return res.status(400).json({ ok: false, error: 'El nombre no puede quedar vacío' });
        }
        const n = await dangerSvc.update(Number(req.params.id), { scope, code, name, reachable, geom, note });
        if (!n) { return res.status(404).json({ ok: false, error: 'Área no encontrada' }); }
        res.json({ ok: true, updated: n });
    } catch (e) {
        console.error('[danger-areas] update', e.message);
        res.status(500).json({ ok: false, error: 'No se pudo actualizar el área' });
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
