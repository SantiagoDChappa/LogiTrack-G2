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
        get paused() { return !!document.getElementById('pause-banner'); },
    };

    // En rutas de solo lectura (finalizadas/canceladas) no hay copiloto.
    if (ctx.readOnly) { return; }

    // ── Estado ────────────────────────────────────────────────────────────────
    // idle | listening | processing | speaking | unavailable
    let state = SpeechRec ? 'idle' : 'unavailable';
    let recognition = null;
    let noSpeechTimer = null;
    let pendingChoice = null; // [cmdA, cmdB] cuando hay que desambiguar (CA9)
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
    // Lectura entendible de direcciones/abreviaturas (CA4).
    function speakable(s) {
        return String(s || '')
            .replace(/\bAv\.?\b/gi, 'Avenida')
            .replace(/\bAvda\.?\b/gi, 'Avenida')
            .replace(/\bCalle\b/gi, 'Calle')
            .replace(/\bdpto\.?\b/gi, 'departamento')
            .replace(/\bPje\.?\b/gi, 'Pasaje')
            .replace(/\bGral\.?\b/gi, 'General');
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

    // CV-02 (versión base; CV-02 endurece los casos límite). Lee la próxima parada real.
    register({
        id: 'next', label: 'Próxima entrega',
        keywords: ['proxima entrega', 'siguiente entrega', 'proxima parada', 'cual es mi proxima', 'siguiente parada', 'a donde voy'],
        run: () => {
            const n = window.LT_NEXT_STOP;
            if (!n) { return { speak: 'No te quedan entregas pendientes.' }; }
            const dir = [n.street, n.number].filter(Boolean).join(' ').trim();
            const who = n.recipient ? `, para ${n.recipient}` : '';
            if (!dir) { return { speak: `Tu próxima entrega no tiene dirección cargada${who}.` }; }
            return { speak: `Tu próxima entrega es en ${speakable(dir)}${who}.` };
        },
    });

    // CV-03..05: registrados (reconocimiento + contexto). Handler placeholder hasta su historia.
    register({
        id: 'pause', label: 'registrar pausa',
        keywords: ['registrar pausa', 'tomar pausa', 'pausar ruta', 'pausa', 'pausar'],
        applies: (c) => c.active ? { ok: true } : { ok: false, reason: 'Esto solo aplica con la ruta en curso.' },
        run: () => ({ speak: 'Reconocí “registrar pausa”. Esta acción se activa en el próximo paso.' }),
    });
    register({
        id: 'resume', label: 'retomar ruta',
        keywords: ['retomar ruta', 'reanudar ruta', 'continuar ruta', 'retomar', 'reanudar'],
        applies: (c) => c.paused ? { ok: true } : { ok: false, reason: 'No hay ninguna pausa activa para retomar.' },
        run: () => ({ speak: 'Reconocí “retomar ruta”. Esta acción se activa en el próximo paso.' }),
    });
    register({
        id: 'unsafe', label: 'reportar zona insegura',
        keywords: ['reportar zona insegura', 'zona insegura', 'lugar inseguro', 'reportar peligro', 'zona peligrosa'],
        run: () => ({ speak: 'Reconocí “reportar zona insegura”. Esta acción se activa en el próximo paso.' }),
    });
    register({
        id: 'failed', label: 'entrega fallida',
        keywords: ['entrega fallida', 'parada no realizada', 'no pude entregar', 'marcar fallida', 'fallida'],
        run: () => ({ speak: 'Reconocí “entrega fallida”. Esta acción se activa en el próximo paso.' }),
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
    function pickVoice() {
        const vs = (TTS && TTS.getVoices && TTS.getVoices()) || [];
        return vs.find((v) => /^es[-_]AR/i.test(v.lang))
            || vs.find((v) => /^es/i.test(v.lang)) || null;
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
            pendingChoice = null; // una escucha fallida abandona cualquier desambiguación pendiente
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
        if (userCancel) { pendingChoice = null; setState('idle'); showBubble(LABELS.idle, 'state'); }
    }

    function handleTranscript(text) {
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
        return runCommand(top.cmd);
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

    function runCommand(cmd) {
        let out;
        try { out = cmd.run(ctx) || {}; }
        catch { return respond('Tuve un problema al procesar ese comando.', { error: true }); }
        Promise.resolve(out).then((r) => respond((r && r.speak) || 'Listo.', {}))
            .catch(() => respond('Tuve un problema al procesar ese comando.', { error: true }));
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
