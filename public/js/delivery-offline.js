/* LogiTrack — integración offline en el portal del repartidor (lado página).
 * - Registra el Service Worker.
 * - La primera vez (con conexión) descarga y cachea CIFRADO el ruteo activo/en tránsito.
 * - Envuelve fetch(): si no hay conexión, encola las acciones operativas y responde
 *   "optimista" para que la UI siga andando; al volver internet, sincroniza en segundo plano.
 * - Conflictos: si el servidor ya cambió la ruta (cancelada/reasignada), gana el servidor
 *   y se avisa al repartidor qué quedó sin aplicar.
 * Requiere offline-db.js cargado antes (define window.LTOffline).
 */
(function () {
    'use strict';
    if (!window.LTOffline) { return; }
    // Se autolimita al portal del repartidor: en el resto del sistema no hace nada
    // (se carga global desde partials/head.ejs, igual que el resto de los assets).
    if (!/^\/delivery(\/|$)/.test(location.pathname)) { return; }

    const origFetch = window.fetch.bind(window);
    const CACHE_NAME = 'lt-delivery-v4';  // debe coincidir con CACHE en sw.js

    // [sync-debug] Manda eventos del flush (que corre en navegador/SW) a Render, vía origFetch
    // para no encolarse a sí mismo. Best-effort: si no hay red, se pierde y no rompe nada.
    // También loguea en consola para depurar desde el celular con DevTools. Quitar al resolver.
    function slog(event, data) {
        try { console.log('[sync]', event, data || ''); } catch (_) { /* */ }
        if (!navigator.onLine) { return; }
        try {
            origFetch('/delivery/sync-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ event, routeId: window.LT_ROUTE_ID || null, ...(data || {}) }),
                keepalive: true,
            }).catch(() => {});
        } catch (_) { /* */ }
    }

    // Acciones operativas encolables offline (van por fetch JSON).
    const QUEUEABLE = /\/delivery\/route\/\d+\/(stop\/\d+\/(arrive|complete|pickup-confirmed|failed|skip|unskip|delivered)|pause|resume|finish)$/;

    const newKey = () => (Date.now() + '-' + Math.random().toString(36).slice(2, 10));

    function toPath(url) {
        try {
            const u = new URL(url, window.location.origin);
            return u.origin === window.location.origin ? u.pathname : null;
        } catch (_) { return null; }
    }
    function stopIdFromPath(path) {
        const m = (path || '').match(/\/stop\/(\d+)\//);
        return m ? m[1] : null;
    }
    function kindFor(path) {
        const m = (path || '').match(/\/(arrive|complete|pickup-confirmed|failed|skip|unskip|delivered|pause|resume|finish)$/);
        return m ? m[1] : 'action';
    }
    function headerVal(headers, name) {
        if (!headers) { return null; }
        if (headers instanceof Headers) { return headers.get(name); }
        const k = Object.keys(headers).find((x) => x.toLowerCase() === name.toLowerCase());
        return k ? headers[k] : null;
    }
    function mergeHeaders(headers, extra) {
        const out = {};
        if (headers instanceof Headers) { headers.forEach((v, k) => { out[k] = v; }); }
        else if (headers) { Object.assign(out, headers); }
        Object.assign(out, extra);
        return out;
    }
    function jsonResponse(status, obj) {
        return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    }
    function synthSuccess(path, bodyStr) {
        const body = { ok: true, queued: true };
        if (/\/failed$/.test(path)) {
            let b = {}; try { b = JSON.parse(bodyStr || '{}'); } catch (_) { /* */ }
            body.retrySameDay = !!b.retrySameDay;
        }
        if (/\/pause$/.test(path)) { body.pauseId = 'offline'; body.startedAt = new Date().toISOString(); }
        // Finalizar offline: marcamos finished para que la UI muestre el flujo normal.
        // La cola es FIFO, así que al sincronizar el server recibe primero las entregas/
        // fallidos encolados y recién después el /finish (transiciones, mails, etc.).
        if (/\/finish$/.test(path)) { body.finished = true; }
        return jsonResponse(200, body);
    }

    async function queueAndSynth(path, method, init, idemKey) {
        const bodyStr = typeof init.body === 'string' ? init.body : '';
        await window.LTOffline.enqueue({
            path, method, body: bodyStr,
            contentType: headerVal(init.headers, 'Content-Type') || 'application/json',
            idempotencyKey: idemKey, kind: kindFor(path),
            routeId: window.LT_ROUTE_ID || null,
        });
        await registerSync();
        updatePill();
        return synthSuccess(path, bodyStr);
    }

    // ── Wrapper de fetch ──
    window.fetch = function (input, init) {
        init = init || {};
        const method = (init.method || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : (input && input.url);
        const path = toPath(url);
        const isQueueable = path && method === 'POST' && QUEUEABLE.test(path);

        if (!isQueueable) { return origFetch(input, init); }

        const idemKey = newKey();

        if (navigator.onLine) {
            const headers = mergeHeaders(init.headers, { 'Idempotency-Key': idemKey });
            return origFetch(input, Object.assign({}, init, { headers }))
                .then((resp) => {
                    if (/\/finish$/.test(path) && resp.ok) { window.LTOffline.clearAll().catch(() => {}); }  // ruta finalizada → autoborrado
                    return resp;
                })
                .catch(() => queueAndSynth(path, method, init, idemKey));  // se cortó la red en pleno request
        }
        return queueAndSynth(path, method, init, idemKey);
    };

    // Para el formulario de POD (evidencia), que arma su propio body urlencoded.
    window.LTOfflineApp = {
        isOnline: () => navigator.onLine,
        enqueuePOD: async function (action) {
            const key = newKey();
            await window.LTOffline.enqueue({
                path: action.path, method: 'POST', body: action.body,
                contentType: 'application/x-www-form-urlencoded',
                idempotencyKey: key, kind: 'pod', routeId: action.routeId || null,
            });
            await registerSync();
            updatePill();
            return key;
        },
    };

    // ── Indicador de estado (pill) ──
    let pill = null;
    function ensurePill() {
        if (pill) { return pill; }
        pill = document.createElement('div');
        pill.id = 'lt-offline-pill';
        pill.style.cssText = [
            'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:14px',
            'z-index:3000', 'padding:8px 14px', 'border-radius:999px', 'font-weight:700',
            'font-size:.8rem', 'box-shadow:0 6px 20px rgba(15,23,42,.25)', 'display:none',
            'align-items:center', 'gap:8px', 'font-family:Inter,system-ui,sans-serif',
            'max-width:92vw', 'text-align:center',
        ].join(';');
        document.body.appendChild(pill);
        return pill;
    }
    async function updatePill() {
        const el = ensurePill();
        let count = 0;
        try { count = await window.LTOffline.outboxCount(); } catch (_) { /* */ }
        if (!navigator.onLine) {
            el.style.display = 'flex';
            el.style.background = '#f59e0b'; el.style.color = '#78350f';
            el.textContent = count > 0
                ? `📴 Sin conexión · ${count} acción(es) en cola`
                : '📴 Sin conexión · trabajando offline';
            return;
        }
        if (count > 0) {
            el.style.display = 'flex';
            el.style.background = '#2563eb'; el.style.color = '#fff';
            el.textContent = `🔄 Sincronizando ${count} acción(es)…`;
            return;
        }
        el.style.display = 'none';
    }

    // ── Sincronización ──
    async function registerSync() {
        try {
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                const reg = await navigator.serviceWorker.ready;
                await reg.sync.register('lt-outbox-sync');
            }
        } catch (_) { /* el fallback es el evento 'online' */ }
    }
    async function triggerFlush() {
        let count = -1;
        try { count = await window.LTOffline.outboxCount(); } catch (_) { /* */ }
        // [sync-debug] Incluimos el rastro de encolado: si la cola está vacía pero el rastro
        // muestra 'enq', es que algo la vació; si tampoco hay 'enq', es que nunca se encoló. Quitar al resolver.
        let trail = [];
        try { trail = await window.LTOffline.readTrail(); } catch (_) { /* */ }
        const viaSW = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
        slog('flush:trigger', { queued: count, online: navigator.onLine, via: viaSW ? 'sw' : 'page', trail });
        if (viaSW) {
            navigator.serviceWorker.controller.postMessage({ type: 'lt-flush' });
        } else {
            handleSyncResult(await window.LTOffline.flushOutbox(origFetch));
        }
    }
    function notify(icon, title, html) {
        if (window.Swal) { window.Swal.fire({ icon, title, html, confirmButtonText: 'Entendido', confirmButtonColor: '#2563eb' }); }
        else { alert(title + (html ? '\n\n' + html.replace(/<[^>]+>/g, '') : '')); }
    }
    let reloadScheduled = false;
    function handleSyncResult(res) {
        if (!res) { slog('flush:result', { result: null }); updatePill(); return; }
        slog('flush:result', {
            sent: res.sent, remaining: res.remaining,
            conflicts: (res.conflicts || []).length, authError: !!res.authError,
        });
        // [sync-debug] Cola drenada del todo: limpiamos el rastro para no acumular. Quitar al resolver.
        if (res.remaining === 0) { window.LTOffline.clearTrail().catch(() => {}); }
        updatePill();
        if (res.authError) {
            notify('warning', 'Sesión expirada', 'Volvé a iniciar sesión para sincronizar las acciones que quedaron en cola.');
            return;
        }
        if (res.conflicts && res.conflicts.length) {
            const li = res.conflicts.map((c) => `<li>${c.error}</li>`).join('');
            notify('warning', 'Algunas acciones no se aplicaron',
                `Mientras estabas sin conexión, el servidor cambió estos envíos. Gana el estado del servidor:<ul style="text-align:left;margin:.5rem 0">${li}</ul>`);
        }
        // Mientras queden acciones en cola NO recargamos: si la red volvió a medias o son
        // varias entregas con foto, recargar acá mostraría un estado parcial. Seguimos
        // drenando y recién recargamos cuando la cola quedó vacía (estado real del server).
        if (res.remaining > 0 && navigator.onLine) {
            setTimeout(triggerFlush, 2000);
            return;
        }
        // Cola drenada: si se aplicó algo y estamos en la ruta, recargamos UNA sola vez.
        if (res.sent > 0 && navigator.onLine && window.LT_ROUTE_ID && !reloadScheduled) {
            reloadScheduled = true;
            setTimeout(() => window.location.reload(), res.conflicts && res.conflicts.length ? 3500 : 500);
        }
    }

    // ── Bundle de la ruta activa ──
    async function cacheActiveBundle() {
        if (!window.LT_ROUTE_ID) { return; }
        if (!window.LT_ROUTE_ACTIVE) {
            // Ruta no activa (planificada/cerrada): si había un bundle viejo de esta ruta, lo borramos.
            const b = await window.LTOffline.getBundle().catch(() => null);
            if (b && Number(b.routeId) === Number(window.LT_ROUTE_ID)) { await window.LTOffline.clearAll().catch(() => {}); }
            return;
        }
        await prefetchRouteForOffline(window.LT_ROUTE_ID);
    }

    // Desde el HOME del repartidor: si hay una ruta EN CURSO, la dejamos lista para operar
    // sin conexión. Así puede cargar el home con señal, quedarse sin datos en esa pantalla y
    // entrar a la ruta + hacer el flujo igual (HTML de la ruta, bundle y páginas de POD ya cacheados).
    async function prefetchActiveRouteFromHome() {
        if (!/^\/delivery\/?$/.test(location.pathname)) { return; }
        if (!window.LT_ACTIVE_ROUTE_ID || !window.LT_ACTIVE_ROUTE_INROUTE) { return; }
        await prefetchRouteForOffline(window.LT_ACTIVE_ROUTE_ID);
    }

    // Deja una ruta lista para operar offline: 1) cachea el HTML de la página de ruta bajo la
    // MISMA clave normalizada (sin query) que usa el SW, 2) guarda el bundle cifrado, 3) precarga
    // las páginas de POD. Reutilizada por la página de ruta y por el home.
    async function prefetchRouteForOffline(routeId) {
        if (!routeId || !navigator.onLine) { return; }
        if ('caches' in window) {
            try {
                const resp = await origFetch(`/delivery/route/${routeId}`, { credentials: 'include' });
                if (resp.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(new Request(location.origin + `/delivery/route/${routeId}`), resp.clone());
                }
            } catch (_) { /* sin red: queda lo ya cacheado */ }
        }
        try {
            const resp = await origFetch(`/delivery/route/${routeId}/offline-bundle`, { credentials: 'include' });
            if (!resp.ok) { return; }  // 409 si la ruta no está IN_ROUTE: nada que precargar
            const data = await resp.json();
            await window.LTOffline.saveBundle(routeId, data, 24 * 60 * 60 * 1000);
            await prefetchPodPages(data);  // así el POD de cada entrega abre sin conexión
        } catch (_) { /* sin conexión: se usa lo ya cacheado */ }
    }

    // Precarga las páginas de POD (foto+firma) de las entregas pendientes en el cache del SW.
    async function prefetchPodPages(bundle) {
        if (!('caches' in window) || !bundle || !bundle.stops) { return; }
        try {
            const cache = await caches.open(CACHE_NAME);
            const pending = bundle.stops.filter((s) => s.stopType === 'delivery' && s.shipment && !s.completed);
            for (const s of pending.slice(0, 40)) {
                const url = `/delivery/evidence/${encodeURIComponent(s.shipment.trackingId)}/pod?routeId=${bundle.routeId}&stopId=${s.id}`;
                try { const r = await origFetch(url, { credentials: 'include' }); if (r.ok) { await cache.put(url, r.clone()); } } catch (_) { /* */ }
            }
        } catch (_) { /* sin Cache API o sin red */ }
    }

    // Reaplica las acciones encoladas sobre la UI de la ruta (al recargar offline).
    async function applyOutboxOverlay() {
        if (!window.LT_ROUTE_ID || window.LT_READONLY) { return; }
        if (typeof window.markStopDone !== 'function' || typeof window.markStopSkipped !== 'function') { return; }
        let items = [];
        try { items = await window.LTOffline.listOutbox(); } catch (_) { return; }
        for (const it of items) {
            const a = it.action;
            if (a.routeId && Number(a.routeId) !== Number(window.LT_ROUTE_ID)) { continue; }
            // POD (entrega con foto+firma): el stopId viaja en el body urlencoded, no en el path.
            // Sin esto, una entrega encolada offline se vería como pendiente al recargar ("ruteo desde 0").
            if (a.kind === 'pod') {
                let podStop = null;
                try { podStop = new URLSearchParams(a.body || '').get('stopId'); } catch (_) { /* */ }
                if (podStop) { window.markStopDone(podStop, 'delivered'); }
                continue;
            }
            const stopId = stopIdFromPath(a.path);
            if (!stopId) { continue; }
            if (a.kind === 'skip') { window.markStopSkipped(stopId, true); }
            else if (a.kind === 'unskip') { window.markStopSkipped(stopId, false); }
            else if (a.kind === 'failed') {
                let b = {}; try { b = JSON.parse(a.body || '{}'); } catch (_) { /* */ }
                if (b.retrySameDay) { window.markStopSkipped(stopId, true); } else { window.markStopDone(stopId, 'failed'); }
            } else if (a.kind === 'pickup-confirmed') { window.markStopDone(stopId, 'pickup-done'); }
            else if (a.kind === 'delivered' || a.kind === 'complete') { window.markStopDone(stopId, 'delivered'); }
        }
    }

    // ── Init ──
    function registerSW() {
        if (!('serviceWorker' in navigator)) { return; }
        navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[offline] SW no registrado:', e.message));
        navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'lt-sync-done') { handleSyncResult(e.data.result); }
        });
    }

    // Autoborrado al cerrar sesión (best-effort).
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a');
        if (a && /(logout|cerrar.?sesion|salir)/i.test(a.getAttribute('href') || '')) {
            window.LTOffline.clearAll().catch(() => {});
        }
    }, true);

    window.addEventListener('online', () => { updatePill(); triggerFlush(); });
    window.addEventListener('offline', () => { updatePill(); });

    function init() {
        registerSW();
        ensurePill();
        updatePill();
        cacheActiveBundle();
        prefetchActiveRouteFromHome();
        applyOutboxOverlay();
        if (navigator.onLine) { triggerFlush(); }  // reenvía lo que haya quedado de una sesión previa
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
