// Cache en memoria con TTL para resultados de funciones async.
// Pensado para catálogos casi inmutables (status, branches, provincias, etc.)
// que se piden en cada render y rara vez cambian.
//
// Uso:
//   const cached = withTtl(60_000, () => Branch.findAll(...));
//   const data = await cached();
//
// Invalidación manual: cached.invalidate()
// Invalidación global por key: invalidate('branches')

const cache = new Map();

const withTtl = (ttlMs, loader, key) => {
    const cacheKey = key || Symbol('anon');
    const wrapped = async () => {
        const now = Date.now();
        const hit = cache.get(cacheKey);
        if (hit && hit.expiresAt > now) { return hit.value; }
        const value = await loader();
        cache.set(cacheKey, { value, expiresAt: now + ttlMs });
        return value;
    };
    wrapped.invalidate = () => cache.delete(cacheKey);
    return wrapped;
};

const invalidate = (key) => cache.delete(key);
const clearAll = () => cache.clear();

module.exports = { withTtl, invalidate, clearAll };
