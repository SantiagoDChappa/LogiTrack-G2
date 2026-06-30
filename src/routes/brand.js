const express = require('express');
const router = express.Router();
const settingModel = require('../models/setting');

// Sirve el logo institucional persistido en la base (base64). Público: se usa en el
// login, el portal y el encabezado. La URL lleva ?v=<timestamp> para invalidar caché.
router.get('/logo', async (req, res) => {
    try {
        const b64 = await settingModel.get('logo_empresa_data');
        if (!b64) { return res.redirect('/images/logo.png'); }
        const mime = (await settingModel.get('logo_empresa_mime')) || 'image/png';
        const buf = Buffer.from(b64, 'base64');
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
    } catch (err) {
        console.error('[brand] error sirviendo logo:', err.message);
        return res.redirect('/images/logo.png');
    }
});

module.exports = router;
