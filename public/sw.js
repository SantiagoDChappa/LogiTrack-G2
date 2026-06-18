/* #4 Service worker del repartidor.
   - Estáticos (css/js/img/fuentes): stale-while-revalidate.
   - Navegaciones bajo /delivery: network-first con fallback a cache → la hoja de ruta
     queda disponible sin conexión luego de verla una vez online.
   - Nunca cachea POST ni /api/*. Se limpia en logout (mensaje 'clear-cache'). */
const CACHE = 'lt-offline-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (e) => {
    if (e.data === 'clear-cache') { caches.delete(CACHE); }
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') { return; }
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) { return; }   // CDNs / OSRM: que vayan a red
    if (url.pathname.startsWith('/api/')) { return; }       // nada dinámico sensible

    const isStatic = url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/')
        || url.pathname.startsWith('/images/') || /\.(css|js|png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/.test(url.pathname);
    if (isStatic) { event.respondWith(staleWhileRevalidate(req)); return; }

    if (req.mode === 'navigate' && (url.pathname === '/delivery' || url.pathname.startsWith('/delivery/'))) {
        event.respondWith(networkFirst(req));
    }
});

async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
        if (res && res.ok) { cache.put(req, res.clone()); }
        return res;
    }).catch(() => cached);
    return cached || network;
}

async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(req);
        if (res && res.ok) { cache.put(req, res.clone()); }
        return res;
    } catch {
        const cached = await cache.match(req);
        return cached || new Response(
            '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
            '<div style="font-family:system-ui;padding:2rem;text-align:center"><h1>Sin conexión</h1>' +
            '<p>Esta pantalla no está disponible offline todavía. Abrila una vez con señal para guardarla.</p></div>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}
