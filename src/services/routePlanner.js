const branchModel = require('../models/branch');
const { haversine } = require('../utils/provinces');

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 8000;

const DIRECT_THRESHOLD_KM = 300;
const MAX_SEGMENT_KM      = 250;
const MAX_DETOUR_RATIO    = 1.15;

const isFiniteCoord = (c) =>
    c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng));

const pickIntermediateBranches = (origin, destination, branches) => {
    const directKm = haversine(origin.lat, origin.lng, destination.lat, destination.lng);
    if (directKm <= DIRECT_THRESHOLD_KM) { return []; }

    const candidates = branches
        .filter(b => isFiniteCoord({ lat: b.latitude, lng: b.longitude }))
        .map(b => {
            const lat = Number(b.latitude);
            const lng = Number(b.longitude);
            const dOrig = haversine(origin.lat, origin.lng, lat, lng);
            const dDest = haversine(lat, lng, destination.lat, destination.lng);
            const detour = (dOrig + dDest) / (directKm || 1);
            return { branch: b, lat, lng, dOrig, dDest, detour };
        })
        .filter(c => c.detour <= MAX_DETOUR_RATIO && c.dOrig > 5 && c.dDest > 5)
        .sort((a, b) => a.dOrig - b.dOrig);

    const picked = [];
    let lastLat = origin.lat;
    let lastLng = origin.lng;
    for (const c of candidates) {
        const segFromLast = haversine(lastLat, lastLng, c.lat, c.lng);
        const segToDest   = haversine(c.lat, c.lng, destination.lat, destination.lng);
        if (segFromLast >= MAX_SEGMENT_KM * 0.6 && segToDest >= MAX_SEGMENT_KM * 0.4) {
            picked.push(c);
            lastLat = c.lat;
            lastLng = c.lng;
        }
        if (haversine(lastLat, lastLng, destination.lat, destination.lng) <= MAX_SEGMENT_KM) {
            break;
        }
    }
    return picked;
};

const buildOSRMUrl = (waypoints) => {
    const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
    if (waypoints.length === 2) {
        return `${OSRM_BASE}/route/v1/driving/${coords}?geometries=geojson&overview=full`;
    }
    return `${OSRM_BASE}/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false&geometries=geojson&overview=full`;
};

const fetchOSRM = async (waypoints) => {
    const url = buildOSRMUrl(waypoints);
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
    if (!res.ok) { throw new Error(`OSRM HTTP ${res.status}`); }
    const data = await res.json();
    if (data.code !== 'Ok') { throw new Error(`OSRM code=${data.code}`); }

    if (waypoints.length === 2) {
        const r = data.routes[0];
        return {
            polyline: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            totalKm:  r.distance / 1000,
            order:    waypoints.map((_, i) => i),
        };
    }
    const trip = data.trips[0];
    const order = data.waypoints
        .map((wp, idx) => ({ wpIdx: wp.waypoint_index, origIdx: idx }))
        .sort((a, b) => a.wpIdx - b.wpIdx)
        .map(o => o.origIdx);
    return {
        polyline: trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        totalKm:  trip.distance / 1000,
        order,
    };
};

const fallbackStraight = (waypoints) => {
    const polyline = waypoints.map(w => [w.lat, w.lng]);
    let totalKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
        totalKm += haversine(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng);
    }
    return { polyline, totalKm, order: waypoints.map((_, i) => i) };
};

const planShipmentRoute = async ({ origin, destination, originBranchId }) => {
    if (!isFiniteCoord(origin) || !isFiniteCoord(destination)) { return null; }
    const o = { lat: Number(origin.lat), lng: Number(origin.lng), label: origin.label || 'Origen' };
    const d = { lat: Number(destination.lat), lng: Number(destination.lng), label: destination.label || 'Destino' };

    let intermediates = [];
    try {
        const allBranches = await branchModel.getAll();
        const usable = allBranches.filter(b => Number(b.id) !== Number(originBranchId));
        intermediates = pickIntermediateBranches(o, d, usable);
    } catch (err) {
        console.warn('[routePlanner] no se pudieron leer sucursales:', err.message);
    }

    const waypoints = [
        { lat: o.lat, lng: o.lng, kind: 'origin', label: o.label },
        ...intermediates.map(i => ({
            lat:   i.lat,
            lng:   i.lng,
            kind:  'branch',
            label: i.branch.name,
            branchId: i.branch.id,
        })),
        { lat: d.lat, lng: d.lng, kind: 'destination', label: d.label },
    ];

    let osrmResult;
    let provider = 'osrm';
    try {
        osrmResult = await fetchOSRM(waypoints);
    } catch (err) {
        console.warn('[routePlanner] OSRM falló, usando línea recta:', err.message);
        osrmResult = fallbackStraight(waypoints);
        provider = 'haversine';
    }

    const ordered = osrmResult.order.map(i => waypoints[i]);
    const stops = ordered.map((wp, idx) => ({
        seq:      idx,
        lat:      wp.lat,
        lng:      wp.lng,
        kind:     wp.kind,
        label:    wp.label,
        branchId: wp.branchId || null,
    }));

    return {
        polyline: osrmResult.polyline,
        totalKm:  osrmResult.totalKm,
        stops,
        provider,
        directKm: haversine(o.lat, o.lng, d.lat, d.lng),
    };
};

module.exports = { planShipmentRoute };
