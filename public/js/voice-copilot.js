/* eslint-env browser */
/* global Swal */
/* Copiloto de Voz — CV-01: interacción por voz base.
 *
 * Base sobre la que se enchufan los comandos (CV-02 a CV-05). Es 100% front-end:
 *   · Reconocimiento: Web Speech API (SpeechRecognition) — corre en el navegador.
 *   · Voz: speechSynthesis — el sistema responde hablando.
 * No envía audio al servidor: solo se usa el texto reconocido y se descarta (regla global 4).
 *
 * Reutiliza globals que define route.ejs: LT_ROUTE_ID, LT_ROUTE_ACTIVE, LT_READONLY, LT_NEXT_STOP.
 * Las acciones reales (pausa, zona insegura, etc.) se completan en CV-02..05: acá esos comandos
 * quedan registrados (palabras clave + contexto) con un handler placeholder.
 */
(function () {
    'use strict';

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const TTS = window.speechSynthesis;

    const ctx = {
        routeId:  window.LT_ROUTE_ID,
        active:   window.LT_ROUTE_ACTIVE === true || window.LT_ROUTE_ACTIVE === 'true',
        readOnly: window.LT_READONLY === true || window.LT_READONLY === 'true',
        get paused() {
            return typeof window.LT_isPaused === 'function'
                ? window.LT_isPaused()
                : !!document.getElementById('pause-banner');
        },
    };

    // En rutas de solo lectura (finalizadas/canceladas) no hay copiloto.
    if (ctx.readOnly) { return; }

    // ── Estado ────────────────────────────────────────────────────────────────
    // idle | listening | processing | speaking | unavailable
    let state = SpeechRec ? 'idle' : 'unavailable';
    let recognition = null;
    let noSpeechTimer = null;
    let pendingChoice = null;  // [cmdA, cmdB] cuando hay que desambiguar (CA9)
    let pendingConfirm = null; // comando esperando "sí/no" antes de ejecutarse (acción sensible)
    let pendingPrompt = null;  // función que captura la próxima respuesta (flujo multipaso: motivo de fallida)
    let audioCtx = null;
    let speakGen = 0;         // invalida callbacks de locuciones interrumpidas (CA12)

    const NO_SPEECH_MS = 7000;   // corte de seguridad si no se detecta voz (CA5)

    // ── Utilidades de texto ─────────────────────────────────────────────────────
    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes
            .replace(/[¿?¡!.,;:]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    // Lectura entendible de direcciones/abreviaturas (CA4). La negative-lookahead evita
    // "comerse" palabras completas (ej.: "Avenida" no se transforma) y consume el punto
    // de la abreviatura para que no quede una pausa rara ("Av. Rivadavia" → "Avenida Rivadavia").
    function speakable(s) {
        return String(s || '')
            .replace(/\bav(?:da)?\.?(?![a-záéíóúñ])/gi, 'Avenida')
            .replace(/\bpje\.?(?![a-záéíóúñ])/gi, 'Pasaje')
            .replace(/\bgral\.?(?![a-záéíóúñ])/gi, 'General')
            .replace(/\bdpto\.?(?![a-záéíóúñ])/gi, 'departamento')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    // Duración hablada para confirmar el tiempo de pausa (CV-03 CA2).
    function fmtPause(sec) {
        sec = Math.max(0, Math.round(sec));
        if (sec < 60) { return `${sec} segundo${sec === 1 ? '' : 's'}`; }
        const m = Math.round(sec / 60);
        return `${m} minuto${m === 1 ? '' : 's'}`;
    }
    // Ubicación actual al momento de confirmar (CV-04 CA4). Devuelve {} si no se puede obtener.
    function getGeo() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) { return resolve({}); }
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
                () => resolve({}),
                { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
            );
        });
    }
    // Interpreta una respuesta de confirmación hablada.
    function interpretYesNo(text) {
        const t = normalize(text);
        if (/^(si|sí|dale|confirmo|confirmar|de una|correcto|afirmativo|ok|oka|okey|obvio|sip)\b/.test(t)) { return 'yes'; }
        return 'no'; // "no", silencio o respuesta poco clara → cancelar (regla: ante la duda, no ejecutar)
    }

    // ── CV-05: flujo de "entrega fallida" (dictado de motivo → lectura → confirmación) ──
    // Saca el disparador inicial del transcript para quedarse solo con el motivo dicho.
    function extractMotivo(raw) {
        return String(raw || '').trim()
            .replace(/^\s*(entrega fallida|marcar (como )?fallida|parada no realizada|no pude entregar|fallida)\b[\s,:.]*/i, '')
            .replace(/^(porque|por que|el motivo es|motivo|ya que|es que|por)\s+/i, '')
            .trim();
    }
    function cleanMotivo(raw) {
        return String(raw || '').trim().replace(/^(porque|por que|el motivo es|motivo|ya que|es que|por)\s+/i, '').trim();
    }
    function classifyFailedConfirm(text) {
        const t = normalize(text);
        if (/^(si|sí|dale|confirmo|confirmar|correcto|afirmativo|ok|okey|de una|obvio|asi es)\b/.test(t)) { return 'yes'; }
        if (/^(cancelar|cancela|olvidalo|dejalo|nada)\b/.test(t)) { return 'cancel'; }
        return 'redo'; // "no", "corregir" o poco claro → re-pedir el motivo (CA3)
    }
    function failedStart(motivo) {
        if (!motivo) { return failedAskMotivo(false); } // CA4
        return failedConfirm(motivo);
    }
    function failedAskMotivo(again) {                   // CA3/CA4: pedir (o re-pedir) el motivo
        pendingPrompt = (text) => {
            const m = cleanMotivo(text);
            if (!m) { return failedAskMotivo(true); }
            return failedConfirm(m);
        };
        respond(again
            ? 'No te entendí el motivo. Decímelo de nuevo, por ejemplo: no había nadie.'
            : '¿Cuál es el motivo de la entrega fallida?', { relisten: true });
    }
    function failedConfirm(motivo) {                    // CA1: lee el motivo y pide confirmar
        pendingPrompt = (text) => {
            const c = classifyFailedConfirm(text);
            if (c === 'yes') { return failedRegister(motivo); }                 // CA2
            if (c === 'cancel') { return respond('Listo, no registro nada.', {}); }
            return failedAskMotivo(false);                                      // CA3 (no/corregir)
        };
        respond(`Voy a marcar la entrega como fallida por: ${motivo}. ¿Confirmás?`, { relisten: true });
    }
    async function failedRegister(motivo) {             // CA2/CA5/CA6/CA7
        const stop = window.LT_NEXT_STOP;
        if (!stop || !stop.id) { return respond('No hay una entrega pendiente para marcar.', {}); }
        const geo = await getGeo();
        let status, data;
        try {
            // window.fetch pasa por la cola offline: sin señal, queda encolado.
            const res = await fetch(`/delivery/route/${ctx.routeId}/stop/${stop.id}/failed`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reasonText: motivo, comment: motivo, latitude: geo.latitude || null, longitude: geo.longitude || null }),
            });
            status = res.status;
            data = await res.json().catch(() => ({}));
        } catch (_) { return respond('No pude registrar el intento, probá de nuevo.', { error: true }); }

        if (status === 409) { return respond(data.error || 'No puedo marcar esta parada todavía.', {}); }      // CA5 (orden/pausa)
        if (!data || (data.ok !== true && !data.queued)) {
            return respond((data && data.error) || 'No pude registrar el intento, probá de nuevo.', { error: true });
        }
        if (data.queued) { return respond('Sin señal: el intento quedó pendiente y lo registro cuando vuelva la conexión.', {}); }
        if (data.maxAttemptsReached) {                                                                          // CA6
            return respond('Intento registrado. Este envío alcanzó el máximo de intentos y no admite más reintentos.', {});
        }
        // CA7: la voz solo deja el intento con su motivo; foto/firma/código se completan a mano en pantalla.
        return respond('Listo, marqué la entrega como no realizada.', {});                                      // CA2
    }

    // ── Registro de comandos ────────────────────────────────────────────────────
    // cada comando: { id, label, keywords[], applies(ctx)->{ok,reason}, run(ctx)->{speak} }
    const commands = [];
    function register(cmd) { commands.push(cmd); }

    register({
        id: 'help', label: 'Ayuda',
        keywords: ['que puedo decir', 'que puedo hacer', 'ayuda', 'comandos', 'opciones'],
        run: () => ({ speak: 'Podés decir: cuál es mi próxima entrega; registrar pausa; retomar ruta; '
            + 'reportar zona insegura; o entrega fallida. También “ayuda” para repetir esta lista.' }),
    });

    // CV-02 — Consultar la próxima entrega.
    // Lee LT_NEXT_STOP (la próxima parada, embebida al renderizar → funciona sin señal, CA3).
    // No tiene applies(): se puede consultar también en pausa (CA5).
    register({
        id: 'next', label: 'Próxima entrega',
        keywords: ['proxima entrega', 'siguiente entrega', 'proxima parada', 'cual es mi proxima',
            'mi proxima entrega', 'siguiente parada', 'a donde voy', 'que sigue'],
        run: () => {
            const n = window.LT_NEXT_STOP;
            if (!n) { return { speak: 'No te quedan entregas pendientes.' }; }              // CA2
            const dir = [n.street, n.number].filter(Boolean).join(' ').trim();
            // CA4: datos faltantes → responder igual, aclarando lo que falta.
            if (!dir && !n.recipient) {
                return { speak: 'Tu próxima entrega no tiene dirección ni destinatario cargados.' };
            }
            if (!dir) {
                return { speak: `Tu próxima entrega es para ${n.recipient}, pero no tiene dirección cargada.` };
            }
            if (!n.recipient) {
                return { speak: `Tu próxima entrega es en ${speakable(dir)}. No figura el destinatario.` };
            }
            return { speak: `Tu próxima entrega es en ${speakable(dir)}, para ${n.recipient}.` };  // CA1
        },
    });

    // CV-03 — Registrar y retomar una pausa (acción real vía hooks de la vista).
    register({
        id: 'pause', label: 'registrar pausa',
        keywords: ['registrar pausa', 'tomar pausa', 'pausar ruta', 'pausa', 'pausar'],
        applies: (c) => {
            if (!c.active) { return { ok: false, reason: 'Esto solo aplica con la ruta en curso.' }; }
            if (c.paused) { return { ok: false, reason: 'Ya hay una pausa en curso.' }; } // CA3
            return { ok: true };
        },
        run: async () => {
            if (typeof window.LT_voicePause !== 'function') { return { speak: 'No puedo registrar la pausa ahora.', error: true }; }
            const r = await window.LT_voicePause('pausa');
            if (r.ok) { return { speak: 'Listo, pausa registrada. Decime retomar ruta cuando arranques de nuevo.' }; } // CA1
            if (r.already) { return { speak: 'Ya hay una pausa en curso.' }; }                                       // CA3 (carrera)
            return { speak: 'No pude registrar la pausa, probá de nuevo.', error: true };                            // CA6
        },
    });
    register({
        id: 'resume', label: 'retomar ruta',
        keywords: ['retomar ruta', 'reanudar ruta', 'continuar ruta', 'retomar', 'reanudar'],
        applies: (c) => c.paused ? { ok: true } : { ok: false, reason: 'No hay ninguna pausa activa para retomar.' }, // CA4
        run: async () => {
            if (typeof window.LT_voiceResume !== 'function') { return { speak: 'No puedo retomar la ruta ahora.', error: true }; }
            const r = await window.LT_voiceResume();
            if (r.ok) {                                                                                              // CA2
                const extra = r.addedSeconds ? ` Estuviste en pausa ${fmtPause(r.addedSeconds)}.` : '';
                return { speak: `Listo, ruta retomada.${extra}` };
            }
            if (r.none) { return { speak: 'No hay ninguna pausa activa para retomar.' }; }
            return { speak: 'No pude retomar la ruta, probá de nuevo.', error: true };                               // CA6
        },
    });
    // CV-04 — Reportar una zona insegura (acción sensible: confirma antes de registrar).
    register({
        id: 'unsafe', label: 'reportar zona insegura',
        keywords: ['reportar zona insegura', 'zona insegura', 'lugar inseguro', 'reportar peligro', 'zona peligrosa'],
        applies: (c) => c.paused ? { ok: false, reason: 'Primero tenés que retomar la ruta.' } : { ok: true },
        confirm: 'Voy a reportar una zona insegura en tu ubicación actual. ¿Confirmás?', // CA1
        run: async () => {
            const geo = await getGeo();                                                  // ubicación al confirmar (CA4)
            const hasGeo = geo.latitude != null && geo.longitude != null;
            let data;
            try {
                // window.fetch pasa por la cola offline: sin señal, queda encolado (CA5).
                const res = await fetch(`/delivery/route/${ctx.routeId}/incident`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        incidentType: 'zona_insegura', severity: 'alta',
                        description: 'Zona insegura reportada por voz',
                        latitude: geo.latitude || null, longitude: geo.longitude || null,
                    }),
                });
                data = await res.json().catch(() => ({}));
                if (!res.ok) { return { speak: 'No pude registrar el reporte, probá de nuevo.', error: true }; } // CA6 implícito
            } catch (_) {
                return { speak: 'No pude registrar el reporte, probá de nuevo.', error: true };
            }
            if (data.queued) {                                                            // CA5 (sin conexión)
                return { speak: 'Sin señal: el reporte quedó pendiente y lo envío cuando vuelva la conexión.' };
            }
            if (!hasGeo) {                                                                // CA4 (sin ubicación)
                return { speak: 'Reporté la zona insegura, pero sin tu ubicación porque no estaba disponible.' };
            }
            return { speak: 'Listo, zona insegura reportada con tu ubicación.' };          // CA2
        },
    });
    // CV-05 — Marcar una parada como no realizada (dicta el motivo, lo confirma, y registra).
    register({
        id: 'failed', label: 'entrega fallida',
        keywords: ['entrega fallida', 'parada no realizada', 'no pude entregar', 'marcar fallida', 'fallida'],
        applies: (c) => {
            if (c.paused) { return { ok: false, reason: 'Primero tenés que retomar la ruta.' }; }       // CV-03 CA5
            if (!window.LT_NEXT_STOP || !window.LT_NEXT_STOP.id) { return { ok: false, reason: 'No hay una entrega pendiente para marcar.' }; }
            return { ok: true };
        },
        // Inicia el flujo multipaso usando el transcript completo para extraer el motivo dicho.
        run: (c, raw) => { failedStart(extractMotivo(raw)); return { handled: true }; },
    });

    // Palabras genéricas que no distinguen un comando de otro (no cuentan para el matching).
    const STOPWORDS = new Set(['esta', 'este', 'para', 'cual', 'como', 'donde', 'esto', 'algo', 'quiero', 'tengo']);
    function tokens(text) {
        return normalize(text).split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    }
    // Tokens distintivos de cada comando (precalculados una vez).
    commands.forEach((cmd) => {
        const set = new Set();
        cmd.keywords.forEach((kw) => tokens(kw).forEach((w) => set.add(w)));
        cmd._tokens = set;
    });

    const STRONG = 100;
    // Puntaje por comando:
    //   · "fuerte" = el repartidor dijo una keyword completa (substring exacto) → +100.
    //   · solapamiento = cantidad de palabras distintivas compartidas.
    // Así "pausar ruta" gana fuerte por pause, pero "ruta" sola queda empatada entre
    // pause y resume (ambas parciales) → ambigüedad real (CA9).
    function scoreCommands(text) {
        const t = normalize(text);
        const spoken = tokens(text);
        return commands
            .map((cmd) => {
                const strong = cmd.keywords.some((kw) => t.includes(normalize(kw)));
                let overlap = 0;
                for (const w of spoken) { if (cmd._tokens.has(w)) { overlap++; } }
                return { cmd, score: (strong ? STRONG : 0) + overlap, strong };
            })
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    // ── Sonidos (earcons) — Web Audio, sin archivos ─────────────────────────────
    function unlockAudio() {
        try {
            if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            if (audioCtx.state === 'suspended') { audioCtx.resume(); }
        } catch { /* sin audio: el copiloto igual funciona con señal visual */ }
    }
    function tone(freq, dur, type) {
        if (!audioCtx) { return; }
        try {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type || 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch { /* noop */ }
    }
    const earcon = {
        start:   () => tone(660, 0.12, 'sine'),
        process: () => tone(520, 0.07, 'sine'),
        error:   () => tone(220, 0.20, 'triangle'),
    };

    // ── Voz (TTS) ───────────────────────────────────────────────────────────────
    // Prioriza el acento más cercano al argentino: AR → resto de Latinoamérica →
    // cualquier español que NO sea de España → (último recurso) España.
    function pickVoice() {
        const vs = (TTS && TTS.getVoices && TTS.getVoices()) || [];
        const byLang = (re) => vs.find((v) => re.test(v.lang));
        return byLang(/^es[-_]AR/i)
            || byLang(/^es[-_](419|US|MX|UY|CL|CO|PE|PY)/i)
            || vs.find((v) => /^es/i.test(v.lang) && !/^es[-_]ES/i.test(v.lang))
            || byLang(/^es/i)
            || null;
    }
    function speak(text, onDone) {
        if (!TTS) { if (onDone) { onDone(); } return; }
        const gen = ++speakGen; // si llega otra locución/interrupción, este callback queda obsoleto
        try {
            TTS.cancel(); // corta cualquier locución previa (CA12)
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'es-AR'; u.rate = 1.0; u.pitch = 1.0;
            const v = pickVoice(); if (v) { u.voice = v; }
            u.onend = () => { if (gen === speakGen && onDone) { onDone(); } };
            u.onerror = () => { if (gen === speakGen && onDone) { onDone(); } };
            TTS.speak(u);
        } catch { if (gen === speakGen && onDone) { onDone(); } }
    }

    // ── UI: botón + burbuja de texto ────────────────────────────────────────────
    let btn = null;
    let bubble = null;
    const LABELS = {
        idle: 'Tocá para hablar',
        listening: 'Escuchando…',
        processing: 'Procesando…',
        speaking: 'Respondiendo…',
        unavailable: 'Voz no disponible',
    };
    function ensureBubble() {
        if (bubble) { return bubble; }
        bubble = document.createElement('div');
        bubble.id = 'voice-bubble';
        bubble.setAttribute('role', 'status');
        bubble.setAttribute('aria-live', 'polite');
        bubble.hidden = true;
        document.body.appendChild(bubble);
        return bubble;
    }
    function showBubble(text, kind) {
        ensureBubble();
        bubble.textContent = text;
        bubble.dataset.kind = kind || 'info';
        bubble.hidden = false;
    }
    function hideBubbleSoon() {
        if (!bubble) { return; }
        clearTimeout(bubble._t);
        bubble._t = setTimeout(() => { if (bubble) { bubble.hidden = true; } }, 6000);
    }
    function setState(s) {
        state = s;
        if (btn) {
            btn.classList.remove('listening', 'processing', 'speaking', 'unavailable');
            if (s !== 'idle') { btn.classList.add(s); }
            btn.setAttribute('aria-label', 'Copiloto de voz: ' + (LABELS[s] || ''));
            btn.setAttribute('aria-pressed', s === 'listening' ? 'true' : 'false');
        }
    }

    // ── Flujo principal ─────────────────────────────────────────────────────────
    function onButton() {
        if (!SpeechRec) { explainUnavailable(); return; }   // CA13
        unlockAudio();
        if (state === 'listening') { stopListening(true); return; }  // CA7 cancelar
        if (state === 'speaking') { speakGen++; if (TTS) { TTS.cancel(); } } // CA12 interrumpir (invalida el callback en curso)
        startListening();
    }

    function startListening() {
        if (state === 'listening') { return; } // evita abrir dos escuchas a la vez
        try {
            recognition = new SpeechRec();
        } catch { genericError(); return; }
        recognition.lang = 'es-AR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
        let handled = false;

        recognition.onstart = () => { setState('listening'); earcon.start(); showBubble(LABELS.listening, 'state'); };
        recognition.onresult = (ev) => {
            handled = true;
            clearTimeout(noSpeechTimer);
            const transcript = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
            setState('processing'); earcon.process(); showBubble(LABELS.processing, 'state');
            setTimeout(() => handleTranscript(transcript), 160); // deja ver el estado "procesando"
        };
        recognition.onerror = (ev) => {
            handled = true;
            clearTimeout(noSpeechTimer);
            pendingChoice = null; pendingConfirm = null; pendingPrompt = null; // escucha fallida → abandona lo pendiente (silencio = cancelar)
            const err = ev && ev.error;
            if (err === 'no-speech') { respond('No escuché nada, tocá para hablar de nuevo.', { error: true }); return; } // CA5
            if (err === 'not-allowed' || err === 'service-not-allowed') { micBlocked(); return; }                          // CA6
            if (err === 'aborted') { setState('idle'); showBubble(LABELS.idle, 'state'); return; }                          // CA7
            genericError();
        };
        recognition.onend = () => {
            if (!handled && state === 'listening') { setState('idle'); showBubble(LABELS.idle, 'state'); }
        };

        try {
            recognition.start();
            clearTimeout(noSpeechTimer);
            noSpeechTimer = setTimeout(() => { try { recognition.stop(); } catch { /* noop */ } }, NO_SPEECH_MS);
        } catch { genericError(); }
    }

    function stopListening(userCancel) {
        clearTimeout(noSpeechTimer);
        try { if (recognition) { userCancel ? recognition.abort() : recognition.stop(); } } catch { /* noop */ }
        if (userCancel) { pendingChoice = null; pendingConfirm = null; pendingPrompt = null; setState('idle'); showBubble(LABELS.idle, 'state'); }
    }

    function handleTranscript(text) {
        // ¿Estamos en un flujo multipaso esperando una respuesta libre? (CV-05: motivo / confirmación)
        if (pendingPrompt) {
            const fn = pendingPrompt;
            pendingPrompt = null;
            return fn(text);
        }

        // ¿Estamos esperando un "sí/no" para una acción sensible? (CV-04 CA2/CA3)
        if (pendingConfirm) {
            const cmd = pendingConfirm;
            pendingConfirm = null;
            if (interpretYesNo(text) === 'yes') { return executeCommand(cmd); }
            return respond('Listo, no hago nada.', {}); // CA3
        }

        // ¿Estamos esperando que elija entre dos opciones? (CA9)
        if (pendingChoice) {
            const choice = matchChoice(text, pendingChoice);
            pendingChoice = null;
            if (!choice) { return respond('Listo, no hago nada.', {}); }
            return runCommand(choice);
        }

        const matches = scoreCommands(text);
        if (matches.length === 0) {                                  // CA8 no reconocida
            return respond('No entendí, ¿podés repetir? Podés decir “¿qué puedo decir?”.', { error: true, relisten: true });
        }
        const top = matches[0];
        const second = matches[1];
        // Ambiguo (CA9): dos comandos parciales (ninguno dicho completo) y empatados → preguntar.
        if (second && !top.strong && !second.strong && top.score === second.score) {
            pendingChoice = [top.cmd, second.cmd];
            return respond(`¿Quisiste decir ${top.cmd.label} o ${second.cmd.label}?`, { relisten: true });
        }
        const applic = top.cmd.applies ? top.cmd.applies(ctx) : { ok: true };
        if (!applic.ok) { return respond(applic.reason, {}); }       // CA10 fuera de contexto
        return runCommand(top.cmd, text);
    }

    function matchChoice(text, options) {
        const t = normalize(text);
        // primero por keywords; si no, por una afirmación simple sobre la primera opción
        for (const cmd of options) {
            if (cmd.keywords.some((kw) => t.includes(normalize(kw))) || t.includes(normalize(cmd.label))) { return cmd; }
        }
        if (/^(si|el primero|la primera|dale|ese|esa)\b/.test(t)) { return options[0]; }
        if (/^(el segundo|la segunda|el otro|la otra)\b/.test(t)) { return options[1]; }
        return null;
    }

    // Acción sensible (cmd.confirm): primero repite qué hará y espera "sí" (CV-04 CA1).
    function runCommand(cmd, text) {
        if (cmd.confirm) {
            pendingConfirm = cmd;
            const prompt = typeof cmd.confirm === 'function' ? cmd.confirm(ctx) : cmd.confirm;
            return respond(prompt, { relisten: true });
        }
        return executeCommand(cmd, text);
    }
    // out puede traer { handled:true } si el comando ya manejó su propia respuesta (flujo multipaso).
    function executeCommand(cmd, text) {
        let out;
        try { out = cmd.run(ctx, text) || {}; }
        catch { return respond('Tuve un problema al procesar ese comando.', { error: true }); }
        Promise.resolve(out).then((r) => {
            if (r && r.handled) { return; }
            respond((r && r.speak) || 'Listo.', { error: !!(r && r.error) });
        }).catch(() => respond('Tuve un problema al procesar ese comando.', { error: true }));
    }

    // Muestra + dice una respuesta. opts: { error, relisten }
    function respond(text, opts) {
        opts = opts || {};
        setState('speaking');
        showBubble(text, opts.error ? 'error' : 'info');
        if (opts.error) { earcon.error(); }
        speak(text, () => {
            if (opts.relisten && SpeechRec) { startListening(); return; }
            setState('idle');
            hideBubbleSoon();
        });
    }

    // ── Casos sin voz disponible / sin permiso ──────────────────────────────────
    function explainUnavailable() {
        const msg = 'El copiloto de voz no está disponible en este navegador. Podés seguir usando todos los botones normalmente.';
        showBubble(msg, 'error');
        if (window.Swal) { Swal.fire({ icon: 'info', title: 'Copiloto de voz', text: msg, confirmButtonColor: '#2563eb' }); }
        hideBubbleSoon();
    }
    function micBlocked() {                                           // CA6
        const msg = 'No tengo permiso para usar el micrófono. Activalo desde el candado de la barra de direcciones y volvé a tocar “Hablar”.';
        setState('idle'); showBubble(msg, 'error'); earcon.error();
        if (window.Swal) { Swal.fire({ icon: 'warning', title: 'Micrófono bloqueado', text: msg, confirmButtonColor: '#2563eb' }); }
        hideBubbleSoon();
    }
    function genericError() {
        setState('idle'); showBubble('No pude escuchar, probá de nuevo.', 'error'); earcon.error();
        hideBubbleSoon();
    }

    // ── Arranque ────────────────────────────────────────────────────────────────
    function init() {
        btn = document.getElementById('btn-voice');
        if (!btn) { return; }
        ensureBubble();
        if (!SpeechRec) { setState('unavailable'); }
        else { setState('idle'); }
        // Precarga de voces (algunos navegadores las cargan async).
        if (TTS && typeof TTS.getVoices === 'function') {
            TTS.getVoices();
            TTS.onvoiceschanged = () => TTS.getVoices();
        }
        btn.addEventListener('click', onButton);
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
