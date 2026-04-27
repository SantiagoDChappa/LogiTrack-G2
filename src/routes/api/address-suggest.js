const express = require('express');
const router  = express.Router();
const { findProvinceByIndec, findProvinceByState } = require('../../utils/provinces');

const GEOREF    = 'https://apis.datos.gob.ar/georef/api';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

function cleanNomenclatura(raw) {
    return (raw || '').replace(/^\d[\d\s]*,\s*/, '').trim();
}

// Parsea la query separando calle, localidad y provincia
function parseQuery(q) {
    const parts = q.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) return { street: parts[0], locality: null, province: null };

    const street = parts[0];
    let locality = null;
    let province = null;

    for (let i = parts.length - 1; i >= 1; i--) {
        const matched = findProvinceByState(parts[i]);
        if (matched) {
            province = matched;
            const localityParts = parts.slice(1, i);
            if (localityParts.length > 0) locality = localityParts.join(', ');
            return { street, locality, province };
        }
    }

    locality = parts.slice(1).join(', ');
    return { street, locality, province };
}

// "1234 Corrientes" → "Corrientes 1234" (Georef requiere calle primero)
function normalizeStreetOrder(q) {
    return q.replace(/^(\d+)\s+(.+)$/, '$2 $1');
}

// ── Georef ────────────────────────────────────────────────────────────────────
async function searchGeoref(streetQuery, provinceIndec, locality) {
    try {
        const normalized = normalizeStreetOrder(streetQuery);
        const fullQuery = locality ? `${normalized}, ${locality}` : normalized;
        let url = `${GEOREF}/direcciones?direccion=${encodeURIComponent(fullQuery)}&max=20&campos=estandar`;
        if (provinceIndec) url += `&provincia=${provinceIndec}`;

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data     = await response.json();
        return data.direcciones || [];
    } catch {
        return [];
    }
}

function mapGeorefItem(item) {
    const province = findProvinceByIndec(item.provincia?.id)
                  || findProvinceByState(item.provincia?.nombre);
    const street = item.calle?.nombre || '';
    const number = item.altura?.valor ? String(item.altura.valor) : '';
    const city   = item.localidad_censal?.nombre || item.departamento?.nombre || '';

    return {
        display_name:  cleanNomenclatura(item.nomenclatura),
        street,
        number,
        city,
        state:         item.provincia?.nombre || '',
        province_id:   province ? province.id   : null,
        province_name: province ? province.name : (item.provincia?.nombre || ''),
        lat:           item.ubicacion?.lat ?? null,
        lng:           item.ubicacion?.lon ?? null,
        postal:        '',   // Georef no devuelve CP; se completa con reverse geocode
    };
}

// ── Nominatim (OpenStreetMap) ─────────────────────────────────────────────────
async function searchNominatim(q) {
    try {
        const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&countrycodes=ar&addressdetails=1&limit=8&format=json`;
        const response = await fetch(url, {
            signal:  AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'LogiTrack/1.0' },
        });
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function mapNominatimItem(item) {
    const addr      = item.address || {};
    const street    = addr.road || addr.pedestrian || addr.path || '';
    const number    = addr.house_number || '';
    const city      = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || '';
    const stateName = addr.state || '';
    const province  = findProvinceByState(stateName);

    const parts = [
        [street, number].filter(Boolean).join(' '),
        city,
        stateName,
    ].filter(Boolean);

    return {
        display_name:  parts.join(', '),
        street,
        number,
        city,
        state:         stateName,
        province_id:   province ? province.id   : null,
        province_name: province ? province.name : stateName,
        lat:           parseFloat(item.lat) || null,
        lng:           parseFloat(item.lon) || null,
        postal:        addr.postcode || '',
    };
}

// Reverse geocode para obtener CP de resultados Georef (máx 2 para no exceder rate limit)
async function fillPostalCodes(results) {
    const needPostal = results.filter(r => !r.postal && r.lat && r.lng).slice(0, 2);
    await Promise.all(needPostal.map(async r => {
        try {
            const url  = `${NOMINATIM}/reverse?lat=${r.lat}&lon=${r.lng}&format=json&addressdetails=1`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { 'User-Agent': 'LogiTrack/1.0' } });
            const data = await resp.json();
            r.postal   = data.address?.postcode || '';
        } catch { /* deja postal vacío */ }
    }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.json([]);

    const { street, locality, province } = parseQuery(q);

    // Georef y Nominatim en paralelo — si uno falla el otro igual responde
    const [georefRaw, nominatimItems] = await Promise.all([
        searchGeoref(street, province?.indec, locality),
        searchNominatim(q + ', Argentina'),
    ]);

    // Si Georef con localidad no da resultados, reintenta solo con provincia
    let georefItems = georefRaw;
    if (georefItems.length < 2 && locality && province) {
        georefItems = await searchGeoref(street, province.indec, null);
    }

    const seen    = new Set();
    const results = [];

    const addResult = (r) => {
        if (!r.street) return;
        const key = `${r.street.toLowerCase()}|${r.number}|${r.city.toLowerCase()}|${r.province_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(r);
    };

    const mappedNominatim = nominatimItems.map(mapNominatimItem);

    georefItems.slice(0, 10).forEach(i => {
        const r = mapGeorefItem(i);
        // Si Georef no trajo coordenadas, buscar en Nominatim un resultado de la misma ciudad
        if ((r.lat == null || r.lng == null) && r.city) {
            const match = mappedNominatim.find(n =>
                n.street.toLowerCase().includes(r.street.toLowerCase().split(' ')[0]) &&
                n.city.toLowerCase().includes(r.city.toLowerCase().split(' ')[0]) &&
                n.lat != null
            );
            if (match) { r.lat = match.lat; r.lng = match.lng; }
        }
        addResult(r);
    });

    // Completa con Nominatim hasta 10 resultados totales
    if (results.length < 6) {
        mappedNominatim.forEach(i => {
            if (results.length >= 10) return;
            addResult(i);
        });
    }

    // Completa CP faltantes en resultados Georef usando reverse geocode
    await fillPostalCodes(results);

    res.json(results);
});

module.exports = router;
