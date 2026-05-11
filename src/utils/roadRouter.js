const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const TIMEOUT_MS = 6000;

const haversineKm = (a, b) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2
        + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
        * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(s));
};

const AVG_SPEED_KMH = 55; // velocidad promedio para fallback

const fallbackRoute = (points) => {
    const legDistancesKm = [];
    const legDurationsSec = [];
    const coords = points.map(p => [p.lng, p.lat]);
    let total = 0;
    let totalSec = 0;
    for (let i = 1; i < points.length; i++) {
        const d = haversineKm(points[i - 1], points[i]);
        const sec = (d / AVG_SPEED_KMH) * 3600;
        legDistancesKm.push(d);
        legDurationsSec.push(sec);
        total += d;
        totalSec += sec;
    }
    return {
        totalKm: total,
        totalDurationSec: totalSec,
        legDistancesKm,
        legDurationsSec,
        geometry: { type: 'LineString', coordinates: coords },
        source: 'haversine',
    };
};

const fetchWithTimeout = async (url) => {
    const ctrl = new globalThis.AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) { throw new Error(`OSRM HTTP ${res.status}`); }
        return await res.json();
    } finally {
        clearTimeout(t);
    }
};

const routeViaRoads = async (points) => {
    if (!Array.isArray(points) || points.length < 2) {
        return { totalKm: 0, legDistancesKm: [], geometry: null, source: 'empty' };
    }
    const valid = points.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
    if (!valid) { return fallbackRoute(points); }

    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false`;
    try {
        const data = await fetchWithTimeout(url);
        if (!data.routes || data.routes.length === 0) { return fallbackRoute(points); }
        const route = data.routes[0];
        const legDistancesKm = (route.legs || []).map(l => Number(l.distance) / 1000);
        const legDurationsSec = (route.legs || []).map(l => Number(l.duration));
        return {
            totalKm: Number(route.distance) / 1000,
            totalDurationSec: Number(route.duration),
            legDistancesKm,
            legDurationsSec,
            geometry: route.geometry,
            source: 'osrm',
        };
    } catch {
        return fallbackRoute(points);
    }
};

const distanceMatrixKm = async (points) => {
    if (!Array.isArray(points) || points.length === 0) { return []; }
    const valid = points.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
    if (!valid) {
        return points.map((a) => points.map((b) => haversineKm(a, b)));
    }
    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/table/v1/driving/${coordsStr}?annotations=distance`;
    try {
        const data = await fetchWithTimeout(url);
        if (!data.distances) { throw new Error('no distances'); }
        return data.distances.map(row => row.map(m => Number(m) / 1000));
    } catch {
        return points.map((a) => points.map((b) => haversineKm(a, b)));
    }
};

module.exports = { routeViaRoads, distanceMatrixKm, haversineKm };
