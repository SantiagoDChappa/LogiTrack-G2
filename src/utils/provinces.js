// Coordenadas aproximadas del centroide de cada provincia argentina.
// id     → id en la tabla province de la DB
// ml     → nombre que espera el modelo Python (sin tildes)
// indec  → código INDEC de provincia (usado por apis.datos.gob.ar/georef)
const PROVINCES = {
    1:  { name: 'Buenos Aires',                    ml: 'Buenos Aires',         indec: '06', lat: -36.6,    lng: -60.0   },
    2:  { name: 'Catamarca',                       ml: 'Catamarca',            indec: '10', lat: -27.3364, lng: -66.9477 },
    3:  { name: 'Chaco',                           ml: 'Chaco',                indec: '22', lat: -26.0,    lng: -61.0   },
    4:  { name: 'Chubut',                          ml: 'Chubut',               indec: '26', lat: -44.0,    lng: -68.0   },
    5:  { name: 'Córdoba',                         ml: 'Cordoba',              indec: '14', lat: -31.4,    lng: -64.2   },
    6:  { name: 'Corrientes',                      ml: 'Corrientes',           indec: '18', lat: -29.0,    lng: -58.0   },
    7:  { name: 'Entre Ríos',                      ml: 'Entre Rios',           indec: '30', lat: -32.0,    lng: -60.0   },
    8:  { name: 'Formosa',                         ml: 'Formosa',              indec: '34', lat: -23.0,    lng: -62.0   },
    9:  { name: 'Jujuy',                           ml: 'Jujuy',                indec: '38', lat: -23.2,    lng: -65.3   },
    10: { name: 'La Pampa',                        ml: 'La Pampa',             indec: '42', lat: -37.0,    lng: -65.0   },
    11: { name: 'La Rioja',                        ml: 'La Rioja',             indec: '46', lat: -29.5,    lng: -67.0   },
    12: { name: 'Mendoza',                         ml: 'Mendoza',              indec: '50', lat: -34.6,    lng: -68.3   },
    13: { name: 'Misiones',                        ml: 'Misiones',             indec: '54', lat: -27.0,    lng: -55.0   },
    14: { name: 'Neuquén',                         ml: 'Neuquen',              indec: '58', lat: -38.0,    lng: -68.0   },
    15: { name: 'Río Negro',                       ml: 'Rio Negro',            indec: '62', lat: -41.0,    lng: -67.0   },
    16: { name: 'Salta',                           ml: 'Salta',                indec: '66', lat: -24.8,    lng: -65.4   },
    17: { name: 'San Juan',                        ml: 'San Juan',             indec: '70', lat: -31.0,    lng: -68.5   },
    18: { name: 'San Luis',                        ml: 'San Luis',             indec: '74', lat: -33.3,    lng: -66.0   },
    19: { name: 'Santa Cruz',                      ml: 'Santa Cruz',           indec: '78', lat: -49.0,    lng: -69.0   },
    20: { name: 'Santa Fe',                        ml: 'Santa Fe',             indec: '82', lat: -31.6,    lng: -60.7   },
    21: { name: 'Santiago del Estero',             ml: 'Santiago del Estero',  indec: '86', lat: -28.0,    lng: -64.0   },
    22: { name: 'Tierra del Fuego',                ml: 'Tierra del Fuego',     indec: '94', lat: -54.0,    lng: -67.0   },
    23: { name: 'Tucumán',                         ml: 'Tucuman',              indec: '90', lat: -26.8,    lng: -65.2   },
    24: { name: 'Ciudad Autónoma de Buenos Aires', ml: 'CABA',                 indec: '02', lat: -34.6037, lng: -58.3816 },
};

// Índice inverso por código INDEC para búsqueda O(1)
const BY_INDEC = Object.fromEntries(
    Object.entries(PROVINCES).map(([id, p]) => [p.indec, { id: parseInt(id), ...p }])
);

function haversine(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLon / 2) ** 2;
    return Math.max(1, Math.round(R * 2 * Math.asin(Math.sqrt(a))));
}

function normalizeStr(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findProvinceByIndec(indecId) {
    if (!indecId) return null;
    // El API devuelve IDs como '02', '6', etc. — normalizamos a 2 dígitos
    const key = String(indecId).padStart(2, '0');
    return BY_INDEC[key] || null;
}

function findProvinceByState(stateName) {
    if (!stateName) return null;
    const norm = normalizeStr(stateName);
    // 1. Exacto por nombre oficial
    for (const [id, p] of Object.entries(PROVINCES)) {
        if (normalizeStr(p.name) === norm) return { id: parseInt(id), ...p };
    }
    // 2. Exacto por alias ml (cubre "CABA", "Cordoba", "Tucuman", etc.)
    for (const [id, p] of Object.entries(PROVINCES)) {
        if (normalizeStr(p.ml) === norm) return { id: parseInt(id), ...p };
    }
    // 3. Parcial por nombre (ej: "Ciudad de Buenos Aires" → CABA)
    for (const [id, p] of Object.entries(PROVINCES)) {
        if (norm.includes(normalizeStr(p.name)) || normalizeStr(p.name).includes(norm)) {
            return { id: parseInt(id), ...p };
        }
    }
    return null;
}

module.exports = { PROVINCES, haversine, findProvinceByIndec, findProvinceByState };
