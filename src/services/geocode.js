const { PROVINCES } = require('../utils/provinces');

const NOMINATIM = 'https://nominatim.openstreetmap.org';

class GeocodeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GeocodeError';
    }
}

const geocodeAddress = async ({ street, number, provinceId }) => {
    const province = PROVINCES[provinceId];
    if (!province) {
        throw new GeocodeError('Provincia inválida');
    }

    const query = `${street} ${number}, ${province.name}, Argentina`;
    const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&countrycodes=ar&addressdetails=1&limit=1&format=json`;

    let data;
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'LogiTrack/1.0' },
        });
        data = await response.json();
    } catch (err) {
        throw new GeocodeError(`No se pudo geocodificar la dirección: ${err.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new GeocodeError('Dirección no encontrada en el servicio de geocodificación');
    }

    const hit = data[0];
    return {
        lat:        parseFloat(hit.lat) || null,
        lng:        parseFloat(hit.lon) || null,
        postalCode: hit.address?.postcode || null,
    };
};

// Geocodifica un código postal argentino a coordenadas (centro aproximado del CP).
// Usado por el cotizador público para ubicar al cliente sin pedir dirección completa.
const geocodePostalCode = async (postalCode) => {
    const cp = String(postalCode || '').trim();
    if (!cp) { throw new GeocodeError('Código postal vacío'); }

    const url = `${NOMINATIM}/search?postalcode=${encodeURIComponent(cp)}&countrycodes=ar&format=json&limit=1`;

    let data;
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'LogiTrack/1.0' },
        });
        data = await response.json();
    } catch (err) {
        throw new GeocodeError(`No se pudo geocodificar el código postal: ${err.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new GeocodeError('Código postal no encontrado');
    }

    return {
        lat: parseFloat(data[0].lat) || null,
        lng: parseFloat(data[0].lon) || null,
    };
};

module.exports = { geocodeAddress, geocodePostalCode, GeocodeError };
