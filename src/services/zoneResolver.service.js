const { Zone } = require('../models/zone');

let cache = null;
let cacheLoadedAt = 0;
const TTL_MS = 60_000;

const loadZones = async () => {
    const now = Date.now();
    if (cache && (now - cacheLoadedAt) < TTL_MS) { return cache; }
    cache = await Zone.findAll({ where: { enabled: true } });
    cacheLoadedAt = now;
    return cache;
};

const invalidateCache = () => { cache = null; };

const matchPostalCode = (zone, postalCode) => {
    if (!postalCode || !zone.postalCodePrefixes) { return false; }
    const prefixes = Array.isArray(zone.postalCodePrefixes) ? zone.postalCodePrefixes : [];
    return prefixes.some(p => String(postalCode).startsWith(String(p)));
};

const resolveZone = async ({ postalCode, provinceId }) => {
    const zones = await loadZones();
    if (postalCode) {
        const byPc = zones.find(z => matchPostalCode(z, postalCode));
        if (byPc) { return byPc; }
    }
    if (provinceId) {
        const byProv = zones.find(z => z.provinceId === Number(provinceId));
        if (byProv) { return byProv; }
    }
    return null;
};

module.exports = { resolveZone, invalidateCache };
