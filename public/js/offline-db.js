/* LogiTrack — capa de almacenamiento offline del repartidor.
 * Funciona tanto en la página (window) como en el Service Worker (self).
 *
 * Guarda CIFRADO (AES-GCM) en IndexedDB:
 *   - el "bundle" de la ruta activa (datos personales del destinatario + código secreto),
 *   - la cola de acciones ("outbox") que se ejecutaron sin conexión.
 *
 * Ley 25.326 / minimización: clave AES random por dispositivo; el bundle expira (TTL 24h)
 * y se borra al finalizar la ruta o cerrar sesión. Limitación honesta: la clave vive en
 * IndexedDB, así que protege el dato "en reposo" (extracción del storage) pero no a un
 * atacante con el equipo desbloqueado y la app abierta.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'logitrack-offline';
    const DB_VERSION = 1;
    const STORE_META = 'meta';      // clave/valor: clave cripto + bundle
    const STORE_OUTBOX = 'outbox';  // acciones encoladas

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_META)) { db.createObjectStore(STORE_META); }
                if (!db.objectStoreNames.contains(STORE_OUTBOX)) { db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' }); }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function reqP(r) {
        return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }
    function txDone(t) {
        return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    }

    async function metaGet(key) {
        const db = await openDB();
        return reqP(db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(key));
    }
    async function metaSet(key, val) {
        const db = await openDB();
        const t = db.transaction(STORE_META, 'readwrite');
        t.objectStore(STORE_META).put(val, key);
        return txDone(t);
    }
    async function metaDel(key) {
        const db = await openDB();
        const t = db.transaction(STORE_META, 'readwrite');
        t.objectStore(STORE_META).delete(key);
        return txDone(t);
    }

    // ── Cripto AES-GCM (con fallback a texto plano en contextos no seguros, ej. http) ──
    const hasCrypto = () => (global.crypto && global.crypto.subtle && typeof global.crypto.subtle.encrypt === 'function');

    async function getKey() {
        const stored = await metaGet('cryptoKey');
        if (stored) { return global.crypto.subtle.importKey('raw', stored, 'AES-GCM', false, ['encrypt', 'decrypt']); }
        const key = await global.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const raw = await global.crypto.subtle.exportKey('raw', key);
        await metaSet('cryptoKey', raw);
        return global.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }

    async function encrypt(obj) {
        if (!hasCrypto()) { return { plain: obj }; }
        const key = await getKey();
        const iv = global.crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(JSON.stringify(obj));
        const ct = await global.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
    }
    async function decrypt(enc) {
        if (!enc) { return null; }
        if (enc.plain !== undefined) { return enc.plain; }
        if (!hasCrypto() || !enc.ct) { return null; }
        const key = await getKey();
        const iv = new Uint8Array(enc.iv);
        const ct = new Uint8Array(enc.ct);
        const pt = await global.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(pt));
    }

    // ── Bundle de la ruta (cifrado, con TTL) ──
    async function saveBundle(routeId, data, ttlMs) {
        const enc = await encrypt(data);
        await metaSet('bundle', {
            routeId, enc,
            savedAt: Date.now(),
            expiresAt: Date.now() + (ttlMs || 24 * 60 * 60 * 1000),
        });
    }
    async function getBundle() {
        const rec = await metaGet('bundle');
        if (!rec) { return null; }
        if (rec.expiresAt && rec.expiresAt < Date.now()) { await clearAll(); return null; }  // autoborrado por TTL
        const data = await decrypt(rec.enc);
        return { routeId: rec.routeId, savedAt: rec.savedAt, expiresAt: rec.expiresAt, data };
    }
    async function clearAll() {
        await metaDel('bundle');
        await metaDel('cryptoKey');
        const db = await openDB();
        const t = db.transaction(STORE_OUTBOX, 'readwrite');
        t.objectStore(STORE_OUTBOX).clear();
        return txDone(t);
    }

    // ── Outbox (cola de acciones, cifrada) ──
    async function enqueue(action) {
        const id = action.idempotencyKey || (Date.now() + '-' + Math.random().toString(36).slice(2, 10));
        action.idempotencyKey = id;
        action.ts = action.ts || Date.now();
        const enc = await encrypt(action);
        const db = await openDB();
        const t = db.transaction(STORE_OUTBOX, 'readwrite');
        t.objectStore(STORE_OUTBOX).put({ id, idempotencyKey: id, enc, ts: action.ts });
        await txDone(t);
        return id;
    }
    async function listOutbox() {
        const db = await openDB();
        const rows = await reqP(db.transaction(STORE_OUTBOX, 'readonly').objectStore(STORE_OUTBOX).getAll());
        const out = [];
        for (const r of rows) { out.push({ id: r.id, ts: r.ts, action: await decrypt(r.enc) }); }
        out.sort((a, b) => a.ts - b.ts);  // FIFO
        return out;
    }
    async function removeFromOutbox(id) {
        const db = await openDB();
        const t = db.transaction(STORE_OUTBOX, 'readwrite');
        t.objectStore(STORE_OUTBOX).delete(id);
        return txDone(t);
    }
    async function outboxCount() {
        const db = await openDB();
        return reqP(db.transaction(STORE_OUTBOX, 'readonly').objectStore(STORE_OUTBOX).count());
    }

    // ── Flush: reenvía la cola al servidor. fetchImpl = fetch de la página o del SW. ──
    // Devuelve { sent, conflicts:[{kind,error}], remaining, authError }.
    async function flushOutbox(fetchImpl) {
        const items = await listOutbox();
        const result = { sent: 0, conflicts: [], remaining: 0, authError: false };
        for (const item of items) {
            const a = item.action;
            try {
                const headers = { 'Idempotency-Key': item.idempotencyKey, 'X-Queued-At': String(item.ts) };
                if (a.contentType) { headers['Content-Type'] = a.contentType; }
                const body = typeof a.body === 'string' ? a.body : JSON.stringify(a.body || {});
                const resp = await fetchImpl(a.path, { method: a.method || 'POST', headers, body, credentials: 'include' });

                if (resp.status === 401 || resp.status === 403) {
                    // Sesión vencida / sin permiso: cortamos. Se reintenta tras re-login.
                    result.authError = true;
                    break;
                }
                if (resp.status === 409) {
                    let data = {};
                    try { data = await resp.json(); } catch (_) { /* sin cuerpo */ }
                    result.conflicts.push({ kind: a.kind || a.path, error: (data && data.error) || 'Conflicto: el servidor ya cambió este envío.' });
                    await removeFromOutbox(item.id);  // gana el servidor: se descarta la acción
                    continue;
                }
                // 2xx (o error de validación no recuperable): se considera consumida.
                await removeFromOutbox(item.id);
                result.sent++;
            } catch (e) {
                // Todavía sin red: dejamos el resto en la cola y cortamos.
                break;
            }
        }
        result.remaining = await outboxCount();
        return result;
    }

    global.LTOffline = {
        saveBundle, getBundle, clearAll,
        enqueue, listOutbox, removeFromOutbox, outboxCount, flushOutbox,
    };
})(typeof self !== 'undefined' ? self : this);
