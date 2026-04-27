const express      = require('express');
const router       = express.Router();
const { PROVINCES, haversine } = require('../../utils/provinces');
const settingModel = require('../../models/setting');

const GEOREF    = 'https://apis.datos.gob.ar/georef/api';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

async function geocodeWithGeoref(street, number, province) {
    try {
        const query = `${street} ${number}`;
        const url   = `${GEOREF}/direcciones?direccion=${encodeURIComponent(query)}&provincia=${province.indec}&max=1&campos=estandar`;
        const res   = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data  = await res.json();
        const item  = (data.direcciones || [])[0];
        if (item?.ubicacion?.lat) {
            return { lat: item.ubicacion.lat, lng: item.ubicacion.lon };
        }
    } catch { /* continúa con Nominatim */ }
    return null;
}

async function geocodeWithNominatim(street, number, province) {
    try {
        const query = `${street} ${number}, ${province.name}, Argentina`;
        const url   = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&countrycodes=ar&limit=1&format=json`;
        const res   = await fetch(url, {
            signal:  AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'LogiTrack/1.0' },
        });
        const data = await res.json();
        if (data[0]?.lat) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch { /* usa centroide como último fallback */ }
    return null;
}

router.post('/', async (req, res) => {
    const { destinationProvinceId, destinationStreet, destinationNumber, destinationLat, destinationLng } = req.body;

    const destProvince = PROVINCES[parseInt(destinationProvinceId)];
    if (!destProvince) {return res.status(400).json({ error: 'Provincia inválida' });}

    const [originLat, originLng, originProvinceMl] = await Promise.all([
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_province_ml'),
    ]);

    const oLat     = parseFloat(originLat     || '-34.6037');
    const oLng     = parseFloat(originLng     || '-58.3816');
    const originMl = originProvinceMl         || 'CABA';

    // Usa lat/lng exactos si vienen del autocomplete; si no, geocodifica con Georef
    let dLat = destProvince.lat;
    let dLng = destProvince.lng;

    if (destinationLat && destinationLng) {
        dLat = parseFloat(destinationLat);
        dLng = parseFloat(destinationLng);
    } else if (destinationStreet && destinationNumber) {
        const coords = await geocodeWithGeoref(destinationStreet, destinationNumber, destProvince)
                    || await geocodeWithNominatim(destinationStreet, destinationNumber, destProvince);
        if (coords) { dLat = coords.lat; dLng = coords.lng; }
    }

    const distance_km = haversine(oLat, oLng, dLat, dLng);

    res.json({
        distance_km,
        origin_province_ml:      originMl,
        destination_province_ml: destProvince.ml,
    });
});

module.exports = router;
