const express = require('express');
const router  = express.Router();
const { PROVINCES, findProvinceByIndec } = require('../../utils/provinces');

const GEOREF = 'https://apis.datos.gob.ar/georef/api';

router.post('/', async (req, res) => {
    const { street, number, provinceId } = req.body;
    if (!street || !number || !provinceId) return res.json({ valid: false });

    const province = PROVINCES[parseInt(provinceId)];
    if (!province) return res.json({ valid: false });

    try {
        const query = `${street} ${number}, ${province.name}`;
        const url   = `${GEOREF}/direcciones?direccion=${encodeURIComponent(query)}&max=1&campos=estandar`;

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data     = await response.json();

        if ((data.direcciones || []).length > 0) {
            const item = data.direcciones[0];
            return res.json({
                valid:             true,
                formatted_address: item.nomenclatura,
                lat:               item.ubicacion?.lat ?? null,
                lng:               item.ubicacion?.lon ?? null,
            });
        }
        return res.json({ valid: false });
    } catch {
        return res.json({ valid: false, timeout: true });
    }
});

module.exports = router;
