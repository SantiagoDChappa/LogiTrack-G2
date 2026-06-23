// Evaluación de destinos peligrosos / no llegables. Aditivo: si no hay áreas
// cargadas, evaluate() devuelve { dangerous:false, reachable:true } y el costeo
// no cambia. La validación principal es por LAT/LONG (point-in-polygon); el
// prefijo de CP queda como respaldo cuando no hay coordenadas o geometría.
const DangerArea = require('../models/dangerArea');
const settingModel = require('../models/setting');
const { pointInGeometry } = require('../utils/geoPoint');

let cache = null;
let cacheLoadedAt = 0;
const TTL_MS = 60_000;

const loadAreas = async () => {
    const now = Date.now();
    if (cache && (now - cacheLoadedAt) < TTL_MS) { return cache; }
    try {
        cache = await DangerArea.findAll({ order: [['created_at', 'DESC']] });
    } catch (e) {
        // Si la tabla todavía no existe (migración 088 sin correr), no rompemos el
        // costeo ni el mapa: tratamos como "sin áreas".
        console.warn('[dangerArea] no se pudo leer danger_area:', e.message);
        cache = [];
    }
    cacheLoadedAt = now;
    return cache;
};

const invalidateCache = () => { cache = null; };

// % global de recargo para destinos peligrosos llegables. 0 si no está seteado.
const getDangerPct = async () => {
    const v = parseFloat(await settingModel.get('recargo_zona_peligrosa_pct'));
    return Number.isFinite(v) && v > 0 ? v : 0;
};

const matchesArea = (area, { postalCode, lat, lng }) => {
    // 1) por coordenadas, contra la geometría (lo más preciso).
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined && area.geom) {
        if (pointInGeometry(Number(lng), Number(lat), area.geom)) { return true; }
    }
    // 2) respaldo por prefijo de CP (scope CP, o cualquier marca con code de CP).
    if (postalCode && area.code && (area.scope === 'CP')) {
        if (String(postalCode).startsWith(String(area.code))) { return true; }
    }
    return false;
};

// Devuelve si el destino está en zona peligrosa y si es llegable. Si cae en varias
// marcas y alguna es "no llegable", manda la no llegable (lo más restrictivo).
const evaluate = async ({ postalCode, lat, lng } = {}) => {
    const areas = await loadAreas();
    const result = { dangerous: false, reachable: true, area: null };
    for (const area of areas) {
        if (!matchesArea(area, { postalCode, lat, lng })) { continue; }
        result.dangerous = true;
        if (!result.area) { result.area = area; }
        if (!area.reachable) { result.reachable = false; result.area = area; break; }
    }
    return result;
};

const list = () => loadAreas();

const create = async (data) => {
    const row = await DangerArea.create({
        scope:     data.scope || 'POLYGON',
        code:      data.code || null,
        name:      data.name,
        reachable: data.reachable !== false && data.reachable !== 'false',
        geom:      data.geom || null,
        note:      data.note || null,
    });
    invalidateCache();
    return row;
};

const remove = async (id) => {
    const n = await DangerArea.destroy({ where: { id } });
    invalidateCache();
    return n;
};

module.exports = { evaluate, getDangerPct, list, create, remove, invalidateCache };
