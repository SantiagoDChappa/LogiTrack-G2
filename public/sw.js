/* LogiTrack — Service Worker del portal del repartidor.
 * - Cachea el "cascarón" (HTML/CSS/JS/mapa) para navegar la ruta sin conexión.
 * - Reenvía la cola de acciones (outbox) en segundo plano cuando vuelve internet
 *   (Background Sync API), aunque la pestaña esté cerrada.
 * El cifrado/cola viven en offline-db.js, compartido con la página.
 */
importScripts('/js/offline-db.js');

const CACHE = 'lt-delivery-v21';
const SHELL = [
    '/css/style.css', '/css/components.css', '/css/shipments.css', '/css/delivery.css',
    '/js/theme.js', '/js/ui.js', '/js/offline-db.js', '/js/delivery-offline.js',
    '/js/voice-copilot.js', '/js/fatigue-reaction-scorer.js',
    '/images/logo_app.png', '/images/icon-192.png', '/images/icon-512.png', '/manifest.webmanifest',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(SHELL).catch(() => { /* algún CDN puede fallar; no abortamos */ }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Red de seguridad offline: en vez de una pantalla muerta de "Sin conexión", cualquier
// navegación del repartidor a una subpágina no cacheada (resumen, detalle de envío, etc.)
// redirige a la página de ruta cacheada — su superficie de trabajo. Así el flujo nunca se
// interrumpe; las acciones operativas se siguen encolando desde el wrapper de fetch de la
// página, de forma independiente a la navegación.
async function fallbackDeliveryNav() {
    try {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        // Página de ruta cacheada (clave normalizada a /delivery/route/N sin query).
        const routeKey = keys.find((k) => /^\/delivery\/route\/\d+$/.test(new URL(k.url).pathname));
        if (routeKey) { return Response.redirect(routeKey.url, 302); }
        // Sin ruta cacheada pero con el home: caemos al inicio del repartidor.
        const home = await caches.match('/delivery', { ignoreSearch: true });
        if (home) { return home; }
    } catch (_) { /* sin Cache API */ }
    // Caso real único: nunca se abrió la ruta con internet en este dispositivo.
    return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<div style="font-family:Inter,system-ui,sans-serif;padding:2rem;text-align:center;color:#334155">'
        + '<p>Abrí tu ruta con internet al menos una vez para poder operarla sin conexión.</p>'
        + '<a href="/delivery" style="color:#2563eb;font-weight:600">Ir a Mi Ruteo</a></div>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
    );
}

function isAsset(url) {
    return /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
        || url.host.includes('unpkg.com')
        || url.host.includes('jsdelivr.net')
        || url.host.includes('fonts.googleapis.com')
        || url.host.includes('fonts.gstatic.com')
        || url.host.includes('basemaps.cartocdn.com');
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') { return; }  // POST/PUT los maneja el wrapper de la página
    const url = new URL(req.url);

    // Navegación a páginas del repartidor (ruta, POD de evidencia, inicio): network-first
    // (cachea la última versión vista), fallback al cache cuando no hay conexión.
    if (req.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/delivery')) {
        // La página de ruta cambia de query en cada paso (?delivered=true, ?queued=1, …).
        // Si guardáramos una entrada por variante, al volver offline `ignoreSearch` podía
        // devolver una copia VIEJA (la primera insertada, con todo pendiente) y las paradas
        // ya entregadas aparecían como nuevas. Normalizamos la clave a pathname sin query:
        // así queda SIEMPRE una sola copia, la más reciente, y offline servimos esa.
        const isRoutePage = /^\/delivery\/route\/\d+$/.test(url.pathname);
        const cacheKey = isRoutePage ? new Request(url.origin + url.pathname) : req;
        event.respondWith(
            fetch(req)
                .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(cacheKey, copy)); return r; })
                // Offline: match por la clave normalizada y, si falla, ignorando el query string.
                .catch(() => caches.match(cacheKey)
                    .then((r) => r || caches.match(req, { ignoreSearch: true }))
                    .then((r) => r || fallbackDeliveryNav()))
        );
        return;
    }

    // Assets (propios y CDNs del mapa): cache-first.
    if (isAsset(url)) {
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req)
                .then((resp) => { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return resp; })
                // Offline y sin match exacto (ej: cambió ?v=assetVersion tras un deploy):
                // reintentamos ignorando el query string para no romper el modo offline.
                .catch(() => caches.match(req, { ignoreSearch: true })))
        );
        return;
    }
    // Resto: comportamiento normal del navegador.
});

// Background Sync: reenvía la cola al recuperar conexión.
self.addEventListener('sync', (event) => {
    if (event.tag === 'lt-outbox-sync') {
        event.waitUntil(flushAndNotify());
    }
});

// La página puede pedir un flush manual (al detectar 'online').
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'lt-flush') {
        event.waitUntil(flushAndNotify());
    }
});

async function flushAndNotify() {
    const result = await self.LTOffline.flushOutbox((url, opts) => fetch(url, Object.assign({ credentials: 'include' }, opts)));
    // Si sincronizamos algo con la app cerrada, el HTML cacheado de la ruta quedó viejo
    // (muestra paradas ya entregadas como pendientes). Lo re-fetcheamos para refrescar la
    // copia normalizada, así la próxima apertura offline ve el estado real del servidor.
    if (result && result.sent > 0) { await refreshRouteCache(); }
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'lt-sync-done', result }));
    return result;
}

async function refreshRouteCache() {
    try {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        const routePages = keys.filter((req) => /^\/delivery\/route\/\d+$/.test(new URL(req.url).pathname));
        for (const req of routePages) {
            try {
                const fresh = await fetch(req.url, { credentials: 'include' });
                if (fresh.ok) { await cache.put(req, fresh.clone()); }
            } catch (_) { /* se cortó la red de nuevo: queda la copia anterior */ }
        }
    } catch (_) { /* sin Cache API */ }
}
