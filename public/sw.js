/* LogiTrack — Service Worker del portal del repartidor.
 * - Cachea el "cascarón" (HTML/CSS/JS/mapa) para navegar la ruta sin conexión.
 * - Reenvía la cola de acciones (outbox) en segundo plano cuando vuelve internet
 *   (Background Sync API), aunque la pestaña esté cerrada.
 * El cifrado/cola viven en offline-db.js, compartido con la página.
 */
importScripts('/js/offline-db.js');

const CACHE = 'lt-delivery-v10';
const SHELL = [
    '/css/style.css', '/css/components.css', '/css/shipments.css', '/css/delivery.css',
    '/js/theme.js', '/js/ui.js', '/js/offline-db.js', '/js/delivery-offline.js', '/js/voice-copilot.js',
    '/images/logo_app.png', '/manifest.webmanifest',
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

function isAsset(url) {
    return /\.(css|js|png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)
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
        event.respondWith(
            fetch(req)
                .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; })
                .catch(() => caches.match(req).then((r) => r || new Response(
                    '<h1>Sin conexión</h1><p>Abrí esta ruta al menos una vez con internet para poder verla offline.</p>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
                )))
        );
        return;
    }

    // Assets (propios y CDNs del mapa): cache-first.
    if (isAsset(url)) {
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req)
                .then((resp) => { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return resp; })
                .catch(() => cached))
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
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'lt-sync-done', result }));
    return result;
}
