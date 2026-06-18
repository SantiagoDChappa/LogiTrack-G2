/* #4 Modo offline del repartidor.
   Registra el service worker, encola en IndexedDB las acciones (POD / intento fallido)
   cuando no hay conexión y las sincroniza al reconectar. Muestra un banner con el estado
   de conexión y la cantidad de acciones pendientes. Solo actúa en /delivery. */
(function () {
    'use strict';

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function (e) {
                console.warn('[offline] SW no registrado:', e && e.message);
            });
        });
    }

    var onDelivery = location.pathname === '/delivery' || location.pathname.indexOf('/delivery/') === 0;

    // ---- IndexedDB: cola de acciones pendientes ----
    var DB = 'lt-offline', STORE = 'pending';
    function openDb() {
        return new Promise(function (resolve, reject) {
            var r = indexedDB.open(DB, 1);
            r.onupgradeneeded = function () {
                if (!r.result.objectStoreNames.contains(STORE)) { r.result.createObjectStore(STORE, { keyPath: 'id' }); }
            };
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
        });
    }
    function enqueue(item) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var t = db.transaction(STORE, 'readwrite');
                t.objectStore(STORE).put(item);
                t.oncomplete = resolve; t.onerror = function () { reject(t.error); };
            });
        });
    }
    function remove(id) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var t = db.transaction(STORE, 'readwrite');
                t.objectStore(STORE).delete(id);
                t.oncomplete = resolve; t.onerror = function () { reject(t.error); };
            });
        });
    }
    function getAll() {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var req = db.transaction(STORE).objectStore(STORE).getAll();
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

    // ---- Envío con fallback a cola ----
    // params: URLSearchParams. Resuelve {ok,url} | {queued:true} | {error:true,status,message}.
    function send(url, params) {
        if (!params.get('clientActionId')) { params.append('clientActionId', genId()); }
        var body = params.toString();
        var id = params.get('clientActionId');
        function queue() {
            return enqueue({ id: id, url: url, body: body, ts: Date.now(), error: null })
                .then(function () { refreshBanner(); return { queued: true }; });
        }
        if (!navigator.onLine) { return queue(); }
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
            .then(function (resp) {
                if (resp.ok || resp.redirected) { return { ok: true, url: resp.url }; }
                return resp.text().then(function (t) { return { error: true, status: resp.status, message: t || ('Error ' + resp.status) }; });
            })
            .catch(function () { return queue(); });
    }

    // ---- Drenaje de la cola ----
    var syncing = false;
    function replay() {
        if (syncing || !navigator.onLine) { return Promise.resolve(); }
        syncing = true;
        return getAll().then(function (items) {
            var chain = Promise.resolve();
            items.forEach(function (it) {
                chain = chain.then(function () {
                    return fetch(it.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: it.body })
                        .then(function (resp) {
                            if (resp.ok || resp.redirected) { return remove(it.id); }
                            if (resp.status >= 400 && resp.status < 500) {
                                // No se pudo aplicar al sincronizar (ej. código clave incorrecto): se deja marcado.
                                it.error = 'No se pudo aplicar (revisar) — ' + resp.status;
                                return enqueue(it);
                            }
                            // 5xx: se reintenta en el próximo ciclo.
                        })
                        .catch(function () { throw new Error('offline'); });
                });
            });
            return chain.catch(function () {});
        }).then(finish, finish);
        function finish() { syncing = false; refreshBanner(); }
    }

    // ---- Banner de estado ----
    var bannerEl;
    function ensureBanner() {
        if (bannerEl || !onDelivery || !document.body) { return; }
        bannerEl = document.createElement('div');
        bannerEl.id = 'lt-offline-banner';
        bannerEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;display:none;align-items:center;gap:.6rem;justify-content:center;padding:.55rem .75rem;font:600 .85rem system-ui,sans-serif;color:#fff;background:#b45309';
        bannerEl.innerHTML = '<span id="lt-ob-text"></span><button id="lt-ob-sync" type="button" style="background:#fff;color:#1d4ed8;border:none;border-radius:6px;padding:.25rem .6rem;font:inherit;cursor:pointer;display:none">Sincronizar</button>';
        document.body.appendChild(bannerEl);
        bannerEl.querySelector('#lt-ob-sync').addEventListener('click', replay);
    }
    function refreshBanner() {
        if (!onDelivery) { return; }
        ensureBanner();
        if (!bannerEl) { return; }
        getAll().then(function (items) {
            var pending = items.length;
            var offline = !navigator.onLine;
            if (!offline && pending === 0) { bannerEl.style.display = 'none'; return; }
            var txt = bannerEl.querySelector('#lt-ob-text');
            var syncBtn = bannerEl.querySelector('#lt-ob-sync');
            if (offline) {
                bannerEl.style.background = '#b45309';
                txt.textContent = 'Sin conexión' + (pending ? ' — ' + pending + ' acción(es) en cola' : ' — modo offline');
                syncBtn.style.display = 'none';
            } else {
                bannerEl.style.background = '#1d4ed8';
                txt.textContent = pending + ' acción(es) pendientes de sincronizar';
                syncBtn.style.display = 'inline-block';
            }
            bannerEl.style.display = 'flex';
        });
    }

    // ---- Intercepción de formularios marcados con data-offline-form ----
    function wireForms() {
        document.querySelectorAll('form[data-offline-form]').forEach(function (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var params = new URLSearchParams();
                Array.prototype.forEach.call(form.elements, function (el) {
                    if (!el.name || el.type === 'file') { return; }
                    if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) { return; }
                    params.append(el.name, el.value);
                });
                send(form.action, params).then(function (r) {
                    if (r.ok) { window.location = r.url; return; }
                    if (r.queued) { window.location = form.getAttribute('data-success') || '/delivery?queued=1'; return; }
                    alert(r.message || 'No se pudo registrar la acción.');
                });
            });
        });
    }

    // Logout: limpiar cache + IndexedDB (la hoja de ruta cacheada tiene datos personales).
    function wireLogout() {
        document.querySelectorAll('a[href="/logout"]').forEach(function (a) {
            a.addEventListener('click', function () {
                try { if (navigator.serviceWorker && navigator.serviceWorker.controller) { navigator.serviceWorker.controller.postMessage('clear-cache'); } } catch (e) { /* */ }
                try { indexedDB.deleteDatabase(DB); } catch (e) { /* */ }
            });
        });
    }

    window.LTOffline = { send: send, replay: replay, genId: genId };

    document.addEventListener('DOMContentLoaded', function () {
        if (onDelivery) { ensureBanner(); refreshBanner(); wireForms(); replay(); }
        wireLogout();
    });
    window.addEventListener('online', function () { refreshBanner(); replay(); });
    window.addEventListener('offline', refreshBanner);
})();
