const express = require('express');
const router = express.Router();
const { normalizeAddress } = require('../../utils/provinces');

router.post('/', (req, res) => {
    const { street, number, province, postalCode } = req.body;
    
    if (!street || !number || !province) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    const result = normalizeAddress(street, number, province, postalCode);
    res.json(result);
});

module.exports = router;
