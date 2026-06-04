/* eslint-env browser */
/* Ojo de Patrón — flujo del transportista (US-1, US-2, US-4, US-9).
 * Desacoplado: envuelve fetch. Cuando POST .../route/:id/start devuelve 409
 * por control de fatiga, abre el modal de consentimiento + prueba y reintenta.
 * Ley 25.326: la muestra se usa de forma efímera; al servidor solo va el score.
 */
(function () {
    'use strict';
    const origFetch = window.fetch.bind(window);

    function routeIdFromStart(url) {
        const m = String(url).match(/\/route\/(\d+)\/start(?:\b|$)/);
        return m ? m[1] : null;
    }

    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const routeId = routeIdFromStart(url);
        const isStart = routeId && method === 'POST' && !(init && init._fatigueRetried);

        const res = await origFetch(input, init);
        if (!isStart || res.status !== 409) { return res; }

        let body;
        try { body = await res.clone().json(); } catch { return res; }
        if (!body || !body.fatigue) { return res; }

        const reason = body.fatigue.reason;
        if (reason === 'BLOCKED') { showBlocked(body.fatigue.score); return res; }

        const passed = await runGate(routeId);
        if (!passed) { return res; } // bloqueado o cancelado → no reintenta

        return origFetch(input, Object.assign({}, init, { _fatigueRetried: true }));
    };

    // ── Orquestación del gate ────────────────────────────────────────────────
    async function runGate(routeId) {
        const cfg = await origFetch(`/delivery/route/${routeId}/fatigue/config`).then(r => r.json()).catch(() => null);
        if (!cfg) { return false; }

        const accepted = await consentModal(cfg.consentVersion);
        if (!accepted) {
            await origFetch(`/delivery/route/${routeId}/consent`, postJson({ accepted: false }));
            toast('No iniciaste la ruta: se requiere consentimiento.');
            return false;
        }
        const consent = await origFetch(`/delivery/route/${routeId}/consent`, postJson({ accepted: true })).then(r => r.json());

        const method = cfg.methodStart || 'VOZ';
        let metrics;
        try {
            metrics = method === 'REACCION' ? await reactionTest() : await voiceTest(cfg.testDurationSec || 5);
        } catch (e) { toast(e.message || 'No se pudo hacer la prueba.'); return false; }

        const out = await origFetch(`/delivery/route/${routeId}/fatigue-check`,
            postJson({ checkId: consent.checkId, method, metrics, triggerType: 'INICIO' })).then(r => r.json());

        if (out.blocked) { showBlocked(out.score); return false; }
        toast(`Apto para salir (fatiga ${out.score}/${out.threshold}).`);
        return true;
    }

    function postJson(obj) {
        return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    function overlay(html) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;background:rgba(14,23,48,.78);display:flex;align-items:center;justify-content:center;z-index:9999;padding:18px;font-family:system-ui,sans-serif';
        el.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.4)">${html}</div>`;
        document.body.appendChild(el);
        return el;
    }
    function toast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0e1730;color:#fff;padding:12px 18px;border-radius:10px;z-index:10000;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    function consentModal(version) {
        return new Promise((resolve) => {
            const box = overlay(`
                <h2 style="margin:0 0 8px;color:#1e2761">Consentimiento — Control de fatiga</h2>
                <p style="font-size:14px;color:#334">Para tu seguridad vamos a tomar una <b>muestra breve</b> (voz o test de reacción)
                y calcular un nivel de fatiga. <b>No guardamos tu voz</b>: se analiza y se descarta al instante; solo se conserva el resultado.</p>
                <p style="font-size:12.5px;color:#667">Responsable: tu empresa/sucursal · Finalidad: evitar conducir fatigado · Destinatarios: tu supervisor y administración ·
                Podés ver y borrar tus datos, y revocar el consentimiento (Ley 25.326). Versión ${version || 'v1'}.</p>
                <p style="font-size:12.5px;color:#a00">Si no aceptás, no podés iniciar la ruta.</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
                    <button data-no style="padding:10px 16px;border:1px solid #ccc;background:#fff;border-radius:10px">No acepto</button>
                    <button data-yes style="padding:10px 16px;border:0;background:#2f9e44;color:#fff;border-radius:10px;font-weight:700">Acepto</button>
                </div>`);
            box.querySelector('[data-yes]').onclick = () => { box.remove(); resolve(true); };
            box.querySelector('[data-no]').onclick = () => { box.remove(); resolve(false); };
        });
    }

    function reactionTest() {
        return new Promise((resolve) => {
            const N = 3; const times = []; let i = 0; let goAt = 0; let armed = false;
            const box = overlay(`
                <h2 style="margin:0 0 6px;color:#1e2761">Test de reacción</h2>
                <p style="font-size:14px;color:#334">Cuando la pantalla se ponga <b style="color:#2f9e44">verde</b>, tocá lo más rápido posible. (${N} intentos)</p>
                <div data-pad style="margin-top:10px;height:200px;border-radius:14px;background:#e03131;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;user-select:none;cursor:pointer">Esperá…</div>
                <p data-info style="font-size:12.5px;color:#667;margin-top:8px">Intento 1 de ${N}</p>`);
            const pad = box.querySelector('[data-pad]');
            const info = box.querySelector('[data-info]');
            function arm() {
                armed = false; pad.style.background = '#e03131'; pad.textContent = 'Esperá…';
                const delay = 900 + Math.random() * 2200;
                setTimeout(() => { armed = true; goAt = performance.now(); pad.style.background = '#2f9e44'; pad.textContent = '¡TOCÁ!'; }, delay);
            }
            pad.onclick = () => {
                if (!armed) { return; } // toque anticipado: se ignora
                const ms = Math.round(performance.now() - goAt);
                times.push(ms); i++;
                if (i >= N) { box.remove(); resolve({ reactionsMs: times }); return; }
                info.textContent = `Intento ${i + 1} de ${N} · último ${ms} ms`;
                arm();
            };
            arm();
        });
    }

    async function voiceTest(seconds) {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            throw new Error('Tu navegador no soporta captura de voz. Usá el test de reacción.');
        }
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { throw new Error('Necesitamos el micrófono para la prueba de voz.'); }

        const box = overlay(`
            <h2 style="margin:0 0 6px;color:#1e2761">Prueba de voz</h2>
            <p style="font-size:14px;color:#334">Hablá normalmente durante <b>${seconds} segundos</b> (contá del 1 al 10).</p>
            <div data-c style="font-size:44px;font-weight:800;text-align:center;color:#2563eb;margin:10px 0">${seconds}</div>
            <p style="font-size:12px;color:#667">El audio se analiza y se descarta. No se guarda.</p>`);
        const cEl = box.querySelector('[data-c]');
        const rec = new MediaRecorder(stream);
        const start = performance.now();
        rec.start();
        let left = seconds;
        const iv = setInterval(() => { left--; cEl.textContent = Math.max(0, left); }, 1000);

        return new Promise((resolve) => {
            setTimeout(() => {
                rec.onstop = () => {
                    const durationMs = Math.round(performance.now() - start);
                    stream.getTracks().forEach(t => t.stop()); // descartar muestra
                    clearInterval(iv); box.remove();
                    resolve({ durationMs }); // efímero: NO se envía el audio, solo la duración
                };
                rec.stop();
            }, seconds * 1000);
        });
    }

    function showBlocked(score) {
        const box = overlay(`
            <h2 style="margin:0 0 6px;color:#e03131">Ruta bloqueada por fatiga</h2>
            <p style="font-size:14px;color:#334">Tu nivel de fatiga (${score != null ? score : '—'}) superó el límite seguro.
            Avisamos a tu supervisor. No podés salir a reparto hasta que lo revise.</p>
            <div style="text-align:right;margin-top:12px"><button data-ok style="padding:10px 16px;border:0;background:#1e2761;color:#fff;border-radius:10px">Entendido</button></div>`);
        box.querySelector('[data-ok]').onclick = () => box.remove();
    }
})();
