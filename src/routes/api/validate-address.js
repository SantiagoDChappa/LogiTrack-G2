const express = require('express');
const router = express.Router();
const { normalizeAddress } = require('../../utils/provinces');

router.post('/', (req, res) => {
    const { street, number, province, postalCode } = req.body;
    
    const missing = [];
    if (!street) missing.push('calle');
    if (!number) missing.push('número');
    if (!province) missing.push('provincia');

    if (missing.length > 0) {
        return res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(', ')}` });
    }

    const result = normalizeAddress(street, number, province, postalCode);
    res.json(result);
});

module.exports = router;
