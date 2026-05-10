// Bounding boxes aproximados por provincia argentina (latMin, latMax, lngMin, lngMax)
// IDs coinciden con tabla logitrack.province
const BBOX = {
    1:  { name: 'Buenos Aires',                latMin: -41.05, latMax: -33.27, lngMin: -63.40, lngMax: -56.66 },
    2:  { name: 'Catamarca',                   latMin: -30.00, latMax: -25.20, lngMin: -69.06, lngMax: -64.50 },
    3:  { name: 'Chaco',                       latMin: -28.00, latMax: -24.10, lngMin: -63.40, lngMax: -58.30 },
    4:  { name: 'Chubut',                      latMin: -46.00, latMax: -41.95, lngMin: -72.00, lngMax: -63.40 },
    5:  { name: 'Cordoba',                     latMin: -35.00, latMax: -29.50, lngMin: -65.80, lngMax: -61.78 },
    6:  { name: 'Corrientes',                  latMin: -30.70, latMax: -27.20, lngMin: -59.65, lngMax: -55.62 },
    7:  { name: 'Entre Rios',                  latMin: -33.80, latMax: -30.15, lngMin: -60.78, lngMax: -57.80 },
    8:  { name: 'Formosa',                     latMin: -26.95, latMax: -22.30, lngMin: -62.50, lngMax: -57.60 },
    9:  { name: 'Jujuy',                       latMin: -24.55, latMax: -21.78, lngMin: -67.30, lngMax: -64.10 },
    10: { name: 'La Pampa',                    latMin: -39.00, latMax: -35.00, lngMin: -68.30, lngMax: -63.36 },
    11: { name: 'La Rioja',                    latMin: -31.85, latMax: -28.00, lngMin: -69.60, lngMax: -66.10 },
    12: { name: 'Mendoza',                     latMin: -37.60, latMax: -32.00, lngMin: -70.60, lngMax: -66.50 },
    13: { name: 'Misiones',                    latMin: -28.20, latMax: -25.50, lngMin: -56.10, lngMax: -53.60 },
    14: { name: 'Neuquen',                     latMin: -41.10, latMax: -36.80, lngMin: -71.95, lngMax: -68.00 },
    15: { name: 'Rio Negro',                   latMin: -42.00, latMax: -37.55, lngMin: -71.95, lngMax: -62.80 },
    16: { name: 'Salta',                       latMin: -26.40, latMax: -22.00, lngMin: -68.55, lngMax: -62.35 },
    17: { name: 'San Juan',                    latMin: -32.55, latMax: -28.05, lngMin: -70.60, lngMax: -66.80 },
    18: { name: 'San Luis',                    latMin: -35.40, latMax: -31.95, lngMin: -67.30, lngMax: -64.85 },
    19: { name: 'Santa Cruz',                  latMin: -52.50, latMax: -45.85, lngMin: -73.55, lngMax: -65.65 },
    20: { name: 'Santa Fe',                    latMin: -34.00, latMax: -28.00, lngMin: -62.85, lngMax: -59.50 },
    21: { name: 'Santiago del Estero',         latMin: -30.70, latMax: -25.55, lngMin: -65.10, lngMax: -61.65 },
    22: { name: 'Tierra del Fuego',            latMin: -55.10, latMax: -52.20, lngMin: -68.65, lngMax: -63.75 },
    23: { name: 'Tucuman',                     latMin: -28.05, latMax: -26.00, lngMin: -66.20, lngMax: -64.45 },
    24: { name: 'CABA',                        latMin: -34.71, latMax: -34.52, lngMin: -58.56, lngMax: -58.33 },
};

const isCoordInProvince = (lat, lng, provinceId) => {
    const bbox = BBOX[Number(provinceId)];
    if (!bbox) { return { ok: false, reason: 'Provincia desconocida' }; }
    if (lat === null || lat === undefined || lng === null || lng === undefined) { return { ok: false, reason: 'Sin coordenadas' }; }
    const inLat = lat >= bbox.latMin && lat <= bbox.latMax;
    const inLng = lng >= bbox.lngMin && lng <= bbox.lngMax;
    if (!inLat || !inLng) {
        return {
            ok: false,
            reason: `Coords (${lat.toFixed(4)}, ${lng.toFixed(4)}) fuera de ${bbox.name} bbox [${bbox.latMin},${bbox.latMax}] x [${bbox.lngMin},${bbox.lngMax}]`,
        };
    }
    return { ok: true };
};

const findProvinceByCoord = (lat, lng) => {
    for (const [id, bbox] of Object.entries(BBOX)) {
        if (lat >= bbox.latMin && lat <= bbox.latMax && lng >= bbox.lngMin && lng <= bbox.lngMax) {
            return { provinceId: Number(id), name: bbox.name };
        }
    }
    return null;
};

module.exports = { isCoordInProvince, findProvinceByCoord, BBOX };
