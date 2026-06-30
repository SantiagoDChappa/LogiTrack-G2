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
    let lastResponse = '';    // última cosa que dijo el copiloto (para el comando "repetir")
    let turnGen = 0;          // invalida respuestas de red que llegan tarde tras cancelar/empezar otra orden
    let wakeMode = false;     // CV-12: escucha continua de la palabra clave (opt-in)
    let wakeRec = null;       // reconocimiento de fondo para el wake word
    let lastSource = 'button'; // cómo se abrió la última escucha: 'button' | 'wake' (telemetría)
    let listenStartedAt = 0;   // marca para medir latencia de reconocimiento (telemetría)

    const NO_SPEECH_MS = 7000;   // corte de seguridad si no se detecta voz (CA5)

    // ── Utilidades de texto ─────────────────────────────────────────────────────
    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes (escape Unicode: no se rompe si el archivo se re-guarda)
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
        if (/^(si|sí|sip|dale|confirmo|confirmar|correcto|afirmativo|ok|oka|okey|de una|obvio|asi es)\b/.test(t)) { return 'yes'; }
        if (/^(cancelar|cancela|olvidalo|dejalo|nada)\b/.test(t)) { return 'cancel'; }
        return 'redo'; // "no", "corregir" o poco claro → re-pedir el motivo (CA3)
    }

    // Motivos oficiales de entrega fallida — los mismos del formulario manual y del cálculo de
    // fecha sugerida. La voz NO guarda el texto crudo como motivo (el STT se equivoca y la
    // oficina recibe basura): encasilla lo dictado en uno de estos códigos y deja lo dictado
    // como observación. Los labels se pueden sobreescribir desde el catálogo configurable del
    // servidor (window.LT_FAILED_REASONS); los sinónimos para reconocer el habla viven acá.
    const FAILED_REASON_DEFS = [
        { code: 'ausente', label: 'Ausente',
            syn: ['ausente', 'no habia nadie', 'no hay nadie', 'no estaba', 'no estaban', 'nadie',
                'no atendio', 'no atiende', 'no responde', 'no contesta', 'no abrio', 'no abre', 'toque y nada'] },
        { code: 'domicilio_erroneo', label: 'Domicilio incorrecto',
            syn: ['domicilio incorrecto', 'domicilio erroneo', 'direccion incorrecta', 'direccion equivocada', 'direccion mal',
                'direccion erronea', 'mal la direccion', 'domicilio inexistente', 'direccion inexistente', 'no existe la direccion',
                'no existe el domicilio', 'no es la direccion', 'no encontre la direccion'] },
        { code: 'rechazo', label: 'Rechazo',
            syn: ['rechazo', 'rechazado', 'rechaza', 'no lo quiso', 'no lo quiere', 'no lo acepto', 'no acepto',
                'no quiso recibir', 'no quiere recibir', 'devolvio el paquete'] },
        { code: 'calle_cortada', label: 'Calle cortada / zona inaccesible',
            syn: ['zona inaccesible', 'inaccesible', 'calle cortada', 'no pude entrar', 'no puedo entrar', 'no se puede acceder',
                'no hay acceso', 'zona peligrosa', 'no llegue', 'no pude llegar'] },
        { code: 'otro', label: 'Otro', syn: [] },
    ];
    function reasonDefs() {
        const override = Array.isArray(window.LT_FAILED_REASONS) ? window.LT_FAILED_REASONS : null;
        if (!override) { return FAILED_REASON_DEFS; }
        return FAILED_REASON_DEFS.map((d) => {
            const o = override.find((x) => x.code === d.code);
            return o ? { ...d, label: o.label || d.label } : d;
        });
    }
    // Encasilla lo dictado en un motivo oficial. Devuelve { code, label, observation, matched } o null.
    function classifyReason(raw) {
        const obs = String(raw || '').trim();
        const t = normalize(obs);
        if (!t) { return null; }
        const defs = reasonDefs();
        for (const d of defs) {
            if (d.syn.some((s) => t.includes(normalize(s)))) {
                return { code: d.code, label: d.label, observation: obs, matched: true };
            }
        }
        const otro = defs.find((d) => d.code === 'otro');           // sin coincidencia → "otro" + lo dictado como detalle
        return { code: 'otro', label: otro ? otro.label : 'Otro', observation: obs, matched: false };
    }

    let failedTries = 0; // CV-05: límite de reintentos al pedir el motivo (no preguntar infinito en manos libres)
    function failedStart(motivoText) {
        failedTries = 0;
        const r = motivoText ? classifyReason(motivoText) : null;
        if (!r) { return failedAskMotivo(false); } // CA4
        return failedConfirm(r);
    }
    function failedAskMotivo(again) {                   // CA3/CA4: pedir (o re-pedir) el motivo
        if (failedTries >= 3) { // tope: corta el loop y deriva a la pantalla
            pendingPrompt = null;
            return respond('No pude entender el motivo. Marcá la entrega como fallida desde la pantalla cuando puedas.', { error: true });
        }
        failedTries++;
        pendingPrompt = (text) => {
            // extractMotivo (no cleanMotivo): saca también el prefijo del comando, así si repite
            // "marcar fallida" como respuesta no termina clasificado como "otro" con basura.
            const r = classifyReason(extractMotivo(text));
            if (!r) { return failedAskMotivo(true); }
            return failedConfirm(r);
        };
        respond(again
            ? 'No te entendí el motivo. Decímelo de nuevo, por ejemplo: no había nadie.'
            : '¿Cuál es el motivo de la entrega fallida?', { relisten: true });
    }
    function failedConfirm(r) {                         // CA1: confirma por el motivo OFICIAL, no por el texto crudo
        pendingPrompt = (text) => {
            const c = classifyFailedConfirm(text);
            if (c === 'yes') { return failedRegister(r); }                     // CA2
            if (c === 'cancel') { return respond('Listo, no registro nada.', {}); }
            return failedAskMotivo(false);                                      // CA3 (no/corregir)
        };
        // Si no se pudo encasillar, avisa que va como "otro" y repite lo dictado para que el repartidor controle.
        const detail = r.matched ? '' : ` con tu comentario: ${r.observation}`;
        respond(`Voy a marcar la entrega como fallida por: ${r.label}${detail}. ¿Confirmás?`, { relisten: true });
    }
    async function failedRegister(motivo) {             // CA2/CA5/CA6/CA7
        const myTurn = turnGen; // si el repartidor cancela mientras se registra, no respondemos tarde
        const stop = window.LT_NEXT_STOP;
        if (!stop || !stop.id) { return respond('No hay una entrega pendiente para marcar.', {}); }
        const geo = await getGeo();
        if (myTurn !== turnGen) { return; } // canceló/empezó otra orden durante el GPS → NO mandar el POST
        // motivo: { code, label, observation } — código oficial + lo dictado tal cual (punto 3)
        let status, data;
        try {
            // window.fetch pasa por la cola offline: sin señal, queda encolado.
            const res = await fetch(`/delivery/route/${ctx.routeId}/stop/${stop.id}/failed`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reasonCode: motivo.code, reasonText: motivo.label, comment: motivo.observation || null,
                    latitude: geo.latitude || null, longitude: geo.longitude || null,
                }),
            });
            status = res.status;
            data = await res.json().catch(() => ({}));
        } catch (_) { return myTurn === turnGen ? respond('No pude registrar el intento, probá de nuevo.', { error: true }) : undefined; }

        if (myTurn !== turnGen) { return; } // el repartidor ya pasó a otra cosa: no pisamos su pantalla

        if (status === 409) { return respond(data.error || 'No puedo marcar esta parada todavía.', {}); }      // CA5 (orden/pausa)
        if (!data || (data.ok !== true && !data.queued)) {
            return respond((data && data.error) || 'No pude registrar el intento, probá de nuevo.', { error: true });
        }
        if (data.queued) { return respond('Sin señal: el intento quedó pendiente y lo registro cuando vuelva la conexión.', {}); }
        if (data.maxAttemptsReached) {                                                                          // CA6
            return respond('Intento registrado. Este envío alcanzó el máximo de intentos y no admite más reintentos.', {});
        }
        // CA7: la voz solo deja el intento con su motivo; foto/firma/código se completan a mano en pantalla.
        return respond(`Listo, marqué la entrega como no realizada por ${motivo.label}.`, {});                   // CA2
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

    // Repetir la última respuesta (cuando el ruido la tapó). No pide confirmación, funciona siempre.
    register({
        id: 'repeat', label: 'repetir',
        keywords: ['repetir', 'repeti', 'repetilo', 'que dijiste', 'no escuche', 'no te escuche', 'como dijiste', 'no escuche bien'],
        run: () => (lastResponse
            ? { speak: lastResponse }
            : { speak: 'Todavía no dije nada para repetir.' }),
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

    // CV-06 — Consultar el avance de la ruta. Lee LT_PROGRESS (embebido → funciona sin señal).
    register({
        id: 'progress', label: 'avance de la ruta',
        keywords: ['cuantas paradas me quedan', 'cuantas paradas faltan', 'cuantas entregas me quedan',
            'cuantas entregas faltan', 'cuanto me falta', 'cuantas me quedan', 'como voy', 'mi avance', 'avance', 'progreso'],
        run: () => {
            const p = window.LT_PROGRESS;
            if (!p || !p.total) { return { speak: 'No tenés entregas en esta ruta.' }; }
            const post = p.postponed > 0
                ? ` ${p.postponed === 1 ? 'Una quedó postergada' : p.postponed + ' quedaron postergadas'} para revisar al final.`
                : '';
            if (p.completed === 0) { // CA2
                return { speak: `Tenés ${p.total} entrega${p.total === 1 ? '' : 's'} en total y todavía no completaste ninguna.${post}` };
            }
            if (p.pending === 0) {
                return { speak: 'Completaste todas las entregas. ¡Buen trabajo!' };
            }
            if (p.pending === 1) { // CA3
                return { speak: `Te queda una sola entrega y llevás ${p.completed} completada${p.completed === 1 ? '' : 's'}.${post}` };
            }
            return { speak: `Te quedan ${p.pending} entregas y llevás ${p.completed} completada${p.completed === 1 ? '' : 's'}.${post}` }; // CA1
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
            if (r.ok && r.queued) { return { speak: 'Sin señal: la pausa quedó en cola y se registra al volver la conexión.' }; } // CV-17
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
            if (r.ok && r.queued) { return { speak: 'Sin señal: la reanudación quedó en cola y se aplica al volver la conexión.' }; } // CV-17
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
            const myTurn = turnGen;
            const geo = await getGeo();                                                  // ubicación al confirmar (CA4)
            if (myTurn !== turnGen) { return { handled: true }; } // canceló durante el GPS → NO registrar
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

    // CV-07 — Pedir ayuda en una emergencia (acción sensible: confirmación breve antes de enviar).
    // Se puede disparar siempre (no se bloquea por pausa ni requiere ruta en curso).
    // "ayuda" queda para la lista de comandos; la emergencia usa disparadores inequívocos.
    register({
        id: 'panic', label: 'emergencia',
        keywords: ['emergencia', 'panico', 'pánico', 'socorro', 'auxilio', 'sos', 'ayuda urgente', 'necesito ayuda', 'pedir ayuda'],
        confirm: '¿Confirmás que querés enviar una alerta de emergencia a la central?', // CA1 (confirmación breve)
        run: async () => {
            const geo = await getGeo();
            const hasGeo = geo.latitude != null && geo.longitude != null;
            let data;
            try {
                // window.fetch pasa por la cola offline: sin señal, queda encolado (CA5).
                const res = await fetch('/delivery/panic', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude: geo.latitude || null, longitude: geo.longitude || null,
                        message: 'SOS por voz desde la app del repartidor', routeId: ctx.routeId || null,
                    }),
                });
                data = await res.json().catch(() => ({}));
                if (!res.ok && !(data && data.queued)) {
                    return { speak: 'No pude enviar la alerta. Probá de nuevo o usá el botón de pánico.', error: true };
                }
            } catch (_) {
                return { speak: 'No pude enviar la alerta. Probá de nuevo o usá el botón de pánico.', error: true };
            }
            if (data.queued) {                                                            // CA5
                return { speak: 'Sin señal: la alerta de emergencia quedó en cola y se envía apenas vuelva la conexión.' };
            }
            if (!hasGeo) {                                                                // CA4
                return { speak: 'Alerta de emergencia enviada a la central, sin tu ubicación porque no estaba disponible.' };
            }
            return { speak: 'Alerta de emergencia enviada a la central con tu ubicación.' }; // CA2
        },
    });

    // CV-14 — Buscar un envío por voz. Consulta de solo lectura: dice dónde está la parada
    // y la resalta en pantalla. No reordena la ruta ni cambia estados. Funciona en pausa/offline.
    register({
        id: 'search', label: 'buscar un envío',
        keywords: ['llevame al paquete', 'llevame a la entrega', 'donde esta el paquete', 'donde esta la entrega',
            'buscar el paquete', 'buscar la entrega', 'buscar paquete', 'buscar entrega', 'paquete de', 'buscar a'],
        run: (c, raw) => { searchStart(extractSearchName(raw)); return { handled: true }; },
    });

    // Saca el disparador inicial y deja solo el nombre buscado (más largo primero).
    function extractSearchName(raw) {
        return String(raw || '').trim().replace(
            /^\s*(llevame al paquete de|llevame a la entrega de|donde esta el paquete de|donde esta la entrega de|buscar el paquete de|buscar la entrega de|el paquete de|la entrega de|paquete de|entrega de|buscar a|buscar)\s*/i,
            ''
        ).trim();
    }
    function extractNameOnly(raw) {
        return String(raw || '').trim().replace(/^(es|el de|la de|de|para|busca a|busca)\s+/i, '').trim();
    }
    function searchStops(name) {
        const stops = Array.isArray(window.LT_STOPS) ? window.LT_STOPS : [];
        const q = normalize(name);
        if (!q) { return []; }
        const words = q.split(' ').filter((w) => w.length >= 3);
        return stops.filter((s) => {
            if (!s.recipient) { return false; }
            const r = normalize(s.recipient);
            return r.includes(q) || words.some((w) => r.includes(w));
        });
    }
    function highlightStop(seq) {
        try {
            const safeSeq = String(seq).replace(/[^0-9]/g, ''); // #10: solo dígitos en el selector
            if (!safeSeq) { return; }
            const el = document.querySelector(`[data-stop-seq="${safeSeq}"]`);
            if (!el) { return; }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('voice-flash');
            setTimeout(() => el.classList.remove('voice-flash'), 2200);
        } catch (_) { /* el resaltado es best-effort: si falla, igual se dijo por voz */ }
    }
    function indicateStop(stop) {
        const dir = [stop.street, stop.number].filter(Boolean).join(' ').trim();
        const who = stop.recipient || 'destinatario sin nombre';
        const where = dir ? `, en ${speakable(dir)}` : '';
        highlightStop(stop.seq);
        return respond(`El paquete de ${who} es la parada ${stop.seq}${where}.`, {}); // CA1
    }
    // ordinalList = las que se nombraron en voz (para "la primera/segunda"); seqList = TODAS las
    // pendientes (para que el número de parada y la calle alcancen a las que no se nombraron).
    function resolvePick(answer, ordinalList, seqList) {
        seqList = seqList || ordinalList;
        const t = normalize(answer);
        const num = t.match(/\b(\d+)\b/);
        if (num) { const s = seqList.find((c) => String(c.seq) === num[1]); if (s) { return s; } }
        const ord = { primera: 0, primero: 0, uno: 0, segunda: 1, segundo: 1, dos: 1, tercera: 2, tercero: 2, tres: 2 };
        for (const k in ord) { if (t.includes(k) && ordinalList[ord[k]]) { return ordinalList[ord[k]]; } }
        // Por calle: alcanza con que el repartidor diga una palabra distintiva de la calle
        // (ej. "rivadavia" para "Av. Rivadavia"), no el nombre completo.
        const byStreet = seqList.find((c) => {
            if (!c.street) { return false; }
            return normalize(c.street).split(' ').filter((w) => w.length >= 4).some((w) => t.includes(w));
        });
        return byStreet || null;
    }
    function searchStart(name) {
        if (!name) { // CA5: no se entendió / no se dijo un nombre
            pendingPrompt = (ans) => searchStart(extractNameOnly(ans));
            return respond('¿De quién es el paquete que buscás?', { relisten: true });
        }
        const matches = searchStops(name);
        if (matches.length === 0) { return respond(`No encontré ninguna entrega para ${name}.`, {}); } // CA2
        const pending = matches.filter((s) => !s.completed);
        const done = matches.filter((s) => s.completed);
        if (pending.length === 0) { // CA6: solo hay coincidencias ya entregadas
            const who = (done[0] && done[0].recipient) || 'esa persona';
            return respond(`La entrega de ${who} ya está completada.`, {});
        }
        if (pending.length === 1) { return indicateStop(pending[0]); } // CA1
        // CA3: varias pendientes → desambiguar. Nombramos en voz solo las primeras, pero el número
        // de parada vale para CUALQUIERA (antes decía "hay 5" y solo dejaba elegir 3 → #3).
        const opts = pending.slice(0, 3);
        pendingPrompt = (ans) => {
            const pick = resolvePick(ans, opts, pending);
            if (pick) { return indicateStop(pick); } // CA4
            return respond('Listo, no hago nada.', {});
        };
        const parts = opts.map((s) => `la parada ${s.seq}${s.street ? ', en ' + speakable(s.street) : ''}`);
        const more = pending.length > opts.length ? `, y ${pending.length - opts.length} más` : '';
        return respond(`Encontré ${pending.length}. Las primeras: ${parts.join('; ')}${more}. Decime el número de parada.`, { relisten: true });
    }

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
        ok:      () => { tone(700, 0.09, 'sine'); setTimeout(() => tone(950, 0.11, 'sine'), 95); }, // ascendente = éxito
        error:   () => tone(220, 0.20, 'triangle'),                                                 // grave = error
    };
    // Vibración (solo móvil): feedback sin mirar ni depender del audio (lo más "manos al volante").
    const buzz = {
        start: () => { try { if (navigator.vibrate) { navigator.vibrate(40); } } catch { /* noop */ } },
        ok:    () => { try { if (navigator.vibrate) { navigator.vibrate(60); } } catch { /* noop */ } },
        error: () => { try { if (navigator.vibrate) { navigator.vibrate([70, 50, 70]); } } catch { /* noop */ } }, // doble = error
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

    // ── Telemetría (punto 4) ────────────────────────────────────────────────────
    // Mide cómo le va al copiloto SIN guardar la grabación ni el texto dictado (privacidad):
    // solo qué intención se detectó, el puntaje, si se entendió y la latencia. Sirve para
    // conocer la tasa de "no entendí" y mejorar las palabras clave con datos reales.
    // Va por sendBeacon: fire-and-forget, no pasa por la cola offline ni bloquea la UI.
    function track(event, extra) {
        try {
            const payload = Object.assign({
                event,                                   // 'command' | 'no-match' | 'ambiguous' | 'wake'
                ts: Date.now(),
                source: lastSource,                      // 'button' | 'wake'
                offline: typeof navigator.onLine === 'boolean' ? !navigator.onLine : null,
                routeId: ctx.routeId || null,
                latencyMs: listenStartedAt ? Date.now() - listenStartedAt : null,
            }, extra || {});
            const body = JSON.stringify(payload);
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/delivery/voice/telemetry', new Blob([body], { type: 'application/json' }));
            }
        } catch { /* la telemetría jamás debe romper el copiloto */ }
    }

    // ── UI: botón + burbuja de texto ────────────────────────────────────────────
    let btn = null;
    let wakeBtn = null;
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
        lastSource = 'button';
        if (state === 'listening') { stopListening(true); return; }  // CA7 cancelar
        if (state === 'speaking') { speakGen++; if (TTS) { TTS.cancel(); } } // CA12 interrumpir (invalida el callback en curso)
        startListening();
    }

    function startListening() {
        if (state === 'listening') { return; } // evita abrir dos escuchas a la vez
        turnGen++;                              // nueva interacción: invalida respuestas de red en vuelo de la anterior
        stopWakeListener();                     // CV-12: un solo reconocimiento activo a la vez
        try {
            recognition = new SpeechRec();
        } catch { genericError(); return; }
        recognition.lang = 'es-AR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
        let handled = false;

        recognition.onstart = () => { listenStartedAt = Date.now(); setState('listening'); earcon.start(); buzz.start(); showBubble(LABELS.listening, 'state'); };
        recognition.onresult = (ev) => {
            handled = true;
            clearTimeout(noSpeechTimer);
            const transcript = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
            if (!transcript || !transcript.trim()) {
                // #8: en mobile el reconocimiento a veces termina con resultado vacío en vez de
                // disparar 'no-speech'. Lo tratamos como "no escuché" (sin re-escuchar) en lugar
                // de "no entendí" + relisten, que es el comportamiento equivocado para este caso.
                pendingChoice = null; pendingConfirm = null; pendingPrompt = null;
                return respond('No escuché nada, tocá para hablar de nuevo.', { error: true });
            }
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
            if (err === 'aborted') { setState('idle'); showBubble(LABELS.idle, 'state'); maybeStartWake(); return; }          // CA7
            genericError();
        };
        recognition.onend = () => {
            if (!handled && state === 'listening') { setState('idle'); showBubble(LABELS.idle, 'state'); maybeStartWake(); }
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
        if (userCancel) { turnGen++; pendingChoice = null; pendingConfirm = null; pendingPrompt = null; setState('idle'); showBubble(LABELS.idle, 'state'); maybeStartWake(); }
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
            track('no-match', { words: tokens(text).length });       // mide la tasa de "no entendí" sin guardar lo dictado
            return respond('No entendí, ¿podés repetir? Podés decir “¿qué puedo decir?”.', { error: true, relisten: true });
        }
        const top = matches[0];
        const second = matches[1];
        // Ambiguo (CA9): dos comandos parciales (ninguno dicho completo) y empatados → preguntar.
        if (second && !top.strong && !second.strong && top.score === second.score) {
            track('ambiguous', { a: top.cmd.id, b: second.cmd.id, score: top.score });
            pendingChoice = [top.cmd, second.cmd];
            return respond(`¿Quisiste decir ${top.cmd.label} o ${second.cmd.label}?`, { relisten: true });
        }
        const applic = top.cmd.applies ? top.cmd.applies(ctx) : { ok: true };
        track('command', { intent: top.cmd.id, score: top.score, strong: top.strong, applied: applic.ok });
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
        const myTurn = turnGen; // si el repartidor cancela o empieza otra orden, esta respuesta queda obsoleta
        let out;
        try { out = cmd.run(ctx, text) || {}; }
        catch { return respond('Tuve un problema al procesar ese comando.', { error: true }); }
        Promise.resolve(out).then((r) => {
            if (myTurn !== turnGen) { return; }
            if (r && r.handled) { return; }
            respond((r && r.speak) || 'Listo.', { error: !!(r && r.error) });
        }).catch(() => { if (myTurn === turnGen) { respond('Tuve un problema al procesar ese comando.', { error: true }); } });
    }

    // Muestra + dice una respuesta. opts: { error, relisten }
    function respond(text, opts) {
        opts = opts || {};
        setState('speaking');
        showBubble(text, opts.error ? 'error' : 'info');
        lastResponse = text; // para el comando "repetir"
        // Feedback sin escuchar la frase: tono + vibración distintos según resultado.
        // Solo en respuestas terminales (no en preguntas/relisten, que son neutras).
        if (opts.error) { earcon.error(); buzz.error(); }
        else if (!opts.relisten) { earcon.ok(); buzz.ok(); }
        speak(text, () => {
            if (opts.relisten && SpeechRec) { startListening(); return; }
            setState('idle');
            hideBubbleSoon();
            maybeStartWake(); // CV-12: al volver a reposo, reanuda la escucha de la palabra clave
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
        maybeStartWake();
    }

    // ── CV-12: activación por palabra clave ("Hola copiloto") ───────────────────
    // Escucha continua en segundo plano (opt-in). Al detectar la frase, abre la escucha
    // de la orden. Un solo reconocimiento activo a la vez: el de fondo se frena cuando
    // arranca una orden y se reanuda al volver a reposo.
    const WAKE_RE = /\b(hola|ola)\s+copiloto\b/;
    function maybeStartWake() {
        if (wakeMode && SpeechRec && state === 'idle') { startWakeListener(); }
    }
    function startWakeListener() {
        if (!wakeMode || wakeRec || state !== 'idle' || !SpeechRec) { return; }
        let rec;
        try { rec = new SpeechRec(); } catch { return; }
        wakeRec = rec;
        rec.lang = 'es-AR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev) => {
            let txt = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) { txt += ev.results[i][0].transcript + ' '; }
            if (WAKE_RE.test(normalize(txt))) { detectWake(); }
        };
        rec.onerror = (ev) => {
            const err = ev && ev.error;
            if (err === 'not-allowed' || err === 'service-not-allowed') { disableWakeForPermission(); }
            // otros errores (no-speech, network): el onend se encarga de reintentar
        };
        rec.onend = () => {
            if (wakeRec === rec) { wakeRec = null; }
            // Chrome corta la escucha continua sola cada tanto: la reanudamos si seguimos atentos.
            if (wakeMode && state === 'idle') { setTimeout(maybeStartWake, 350); }
        };
        try { rec.start(); } catch { wakeRec = null; }
    }
    function stopWakeListener() {
        if (!wakeRec) { return; }
        const rec = wakeRec; wakeRec = null;
        rec.onend = null; rec.onresult = null; rec.onerror = null; // que no se reinicie al abortar
        try { rec.abort(); } catch { /* noop */ }
    }
    function detectWake() {
        stopWakeListener();
        unlockAudio();
        lastSource = 'wake';
        track('wake', {});
        earcon.start();
        startListening(); // CA1: la palabra clave abre la escucha de la orden
    }
    function toggleWake() {
        if (!SpeechRec) { explainUnavailable(); return; }
        unlockAudio();
        wakeMode = !wakeMode;
        updateWakeBtn();
        if (wakeMode) { respond('Modo escucha activado. Decí: hola copiloto, y después tu orden.', {}); }
        else { stopWakeListener(); respond('Modo escucha desactivado.', {}); }
    }
    function updateWakeBtn() {
        if (!wakeBtn) { return; }
        wakeBtn.classList.toggle('active', wakeMode);
        wakeBtn.setAttribute('aria-pressed', wakeMode ? 'true' : 'false');
    }
    function disableWakeForPermission() {
        wakeMode = false; stopWakeListener(); updateWakeBtn();
        micBlocked();
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

        // CV-12: botón de modo escucha (palabra clave). Solo si el navegador soporta voz.
        wakeBtn = document.getElementById('btn-voice-wake');
        if (wakeBtn) {
            if (!SpeechRec) { wakeBtn.style.display = 'none'; }
            else { updateWakeBtn(); wakeBtn.addEventListener('click', toggleWake); }
        }
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
