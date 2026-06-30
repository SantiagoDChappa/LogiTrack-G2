const express = require('express');
const router = express.Router();
const { PROVINCES } = require('../../utils/provinces');
const { haversine } = require('../../utils/geo');
const settingModel = require('../../models/setting');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5001/predict';

router.post('/', async (req, res) => {
    const {
        destinationProvinceId, destinationStreet, destinationNumber,
        destinationLat, destinationLng,
        weight_kg, package_quantity, ship_type,
    } = req.body;

    const destProvince = PROVINCES[parseInt(destinationProvinceId)];
    if (!destProvince) return res.status(400).json({ error: 'Provincia inválida' });

    const [originLat, originLng, originProvinceMl] = await Promise.all([
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_province_ml'),
    ]);

    const oLat = parseFloat(originLat || '-34.6037');
    const oLng = parseFloat(originLng || '-58.3816');
    const originMl = originProvinceMl || 'CABA';

    let dLat = destProvince.lat;
    let dLng = destProvince.lng;

    if (destinationLat && destinationLng) {
        dLat = parseFloat(destinationLat);
        dLng = parseFloat(destinationLng);
    } else if (destinationStreet && destinationNumber) {
        const georefUrl = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(destinationStreet + ' ' + destinationNumber)}&provincia=${destProvince.indec}&max=1&campos=estandar`;
        try {
            const geoRes = await fetch(georefUrl, { signal: AbortSignal.timeout(5000) });
            const geoData = await geoRes.json();
            const item = (geoData.direcciones || [])[0];
            if (item?.ubicacion?.lat) {
                dLat = item.ubicacion.lat;
                dLng = item.ubicacion.lon;
            }
        } catch { /* usa centroide */ }
    }

    const distance_km = haversine(oLat, oLng, dLat, dLng);

    const now = new Date();
    const mlDay = (now.getDay() + 6) % 7;
    const month = now.getMonth() + 1;

    try {
        const flaskRes = await fetch(ML_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                distance_km,
                weight_kg: parseFloat(weight_kg),
                package_quantity: parseInt(package_quantity),
                ship_type,
                day_of_week: mlDay,
                month,
                origin_province: originMl,
                destination_province: destProvince.ml,
                shipmentId: req.body.shipmentId,
            }),
            signal: AbortSignal.timeout(5000),
        });

        if (!flaskRes.ok) throw new Error('Flask error');

        const pred = await flaskRes.json();
        res.json({ ...pred, distance_km, origin_province_ml: originMl, destination_province_ml: destProvince.ml });
    } catch (err) {
        console.error('[estimate] ML error:', err.message);
        const days = ship_type === 0 ? 2 : 5;
        res.json({
            delivery_days: days, probability: 0, delayed: false, label: 'ESTIMATED',
            distance_km, origin_province_ml: originMl, destination_province_ml: destProvince.ml,
        });
    }
});

module.exports = router;