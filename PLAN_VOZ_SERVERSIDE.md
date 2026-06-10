# Plan — Prueba de voz server-side (compatible iOS)

> Objetivo: que la prueba de voz del Ojo de Patrón funcione en **cualquier dispositivo** (incluido iPhone/iPad), reemplazando la Web Speech API del navegador (que en iOS no capta audio y en Chrome depende de los servidores de Google).

## Problema actual
- La validación usa `webkitSpeechRecognition` (Web Speech API), que corre **en el navegador**.
- En **iOS** (todos los navegadores = WebKit) reporta "soportado" pero **no captura audio** (`gotSound:false`). Confirmado por logs.
- En Chrome desktop manda el audio a Google y requiere internet a esos servidores (puede fallar en redes restringidas).
- No hay control nuestro sobre el reconocimiento → poco confiable y no testeable.

## Solución propuesta
Grabar el audio en el cliente con **MediaRecorder** (sí funciona en iOS), enviarlo al **backend**, transcribir con un servicio **Speech-to-Text (STT)**, comparar contra la frase y devolver el `matchRatio`. El audio es **efímero** (Ley 25.326): se procesa y se descarta, nunca se persiste; solo se guarda el puntaje.

```
[Navegador] graba ~Xs (MediaRecorder, webm/opus o mp4/aac en iOS)
     │  POST multipart  /delivery/route/:id/fatigue/voz-stt  { frase, audio }
     ▼
[Backend Node] → STT API (Google Cloud / Azure / Whisper) → transcripción
     │  similitudFrase(transcripción, frase)  (Levenshtein por palabra, ya existe)
     ▼  responde { matchRatio, dicho }   (NUNCA devuelve ni guarda el audio)
[Navegador] mismo flujo que hoy: si matchRatio ≥ MIN_MATCH → apto
```

## Elección de proveedor STT
| Opción | Pro | Contra |
|--------|-----|--------|
| **OpenAI Whisper API** (`audio/transcriptions`) | Simple, buena precisión en español, 1 request | Costo por minuto, key, datos salen a OpenAI |
| **Google Cloud Speech-to-Text** | Robusto, es_AR | Setup GCP + credenciales JSON |
| **Azure Speech** | Buen español | Setup Azure |
| **Whisper local** (whisper.cpp / faster-whisper) | Sin costo por uso, datos no salen | Necesita CPU/contenedor; Render free no aguanta |

**Recomendado para el TP:** Whisper API (OpenAI) por simplicidad — 1 endpoint, multipart, devuelve texto. Documentar en el dilema ético que el audio sale a un tercero (igual que hoy con Google, pero ahora controlado y efímero).

## Fases

### Fase 1 — Backend STT
- `src/services/fatigue/stt.js`: `transcribe(buffer, mimeType) → texto`. Encapsula el proveedor (interfaz única para poder cambiarlo).
- Endpoint `POST /delivery/route/:id/fatigue/voz-stt` (en `routes/delivery.js`, `requireDelivery` + `ownRouteOr403`):
  - Recibe `multipart/form-data`: `frase` + `audio` (usar `multer` en memoria, límite ~2 MB, **sin** guardar a disco).
  - Llama `stt.transcribe(...)`, calcula `similitudFrase` (mover el helper a un módulo compartido reutilizable server/cliente o reimplementarlo en server).
  - Responde `{ ok, matchRatio, dicho }`. **No** loguea ni persiste el audio (Ley 25.326).
- Env: `STT_PROVIDER` (`openai`|`google`|`azure`|`none`), `OPENAI_API_KEY` (u otras). Si `none` → 501 y el cliente cae al método actual.

### Fase 2 — Cliente (grabación)
- En `route.ejs` `pruebaVoz`: nueva rama "grabar + subir" cuando el server tenga STT (flag desde `/fatigue/config`, ej. `voiceSttEnabled`).
  - `getUserMedia({audio:true})` + `MediaRecorder` (mimeType según soporte: `audio/webm;codecs=opus`, fallback `audio/mp4` en iOS).
  - Grabar `testDurationSec` segundos (mismo auto-corte), mostrar "🔴 Micrófono activado" + countdown (ya está).
  - `POST` el blob al endpoint, recibir `matchRatio`, seguir el flujo existente (apto / reintentar / volver).
- Mantener la Web Speech API como camino alternativo en navegadores donde ande (o eliminarla y usar STT siempre).

### Fase 3 — Config y scoring
- `fatigue/config`: `voiceSttEnabled` (bool) para prender/apagar el camino server-side.
- El `scoreFromVoice({matchRatio})` ya existe y sirve igual (no cambia).

### Fase 4 — Ley 25.326 / privacidad
- Audio en memoria, nunca a disco ni DB. Procesar y descartar.
- Documentar el proveedor STT en `LogiTrack_Dilema_Etico_OjoDePatron.docx`: dato biométrico de voz procesado efímeramente por un tercero (país, finalidad, retención = 0 del audio crudo, solo puntaje).
- Consentimiento ya cubre "muestra de voz" — revisar el texto para nombrar el procesamiento externo.

### Fase 5 — Tests y verificación
- Unit: `stt.transcribe` mockeado → `similitudFrase` correcta.
- Endpoint: `supertest` con un audio fixture chico y STT mockeado.
- Manual: iPhone (Safari y Chrome iOS), Android, desktop.

## Estimación gruesa
- Fase 1: ~0.5–1 día (endpoint + integración STT + multer).
- Fase 2: ~1 día (MediaRecorder cross-browser, iOS es el más quisquilloso con mimeTypes).
- Fase 3–4: ~0.5 día.
- Fase 5: ~0.5 día.
- **Total ~2.5–3 días.**

## Riesgos
- **Render free**: contenedor chico, Whisper local no entra → usar API externa.
- **iOS MediaRecorder**: formatos limitados (`audio/mp4`/aac). Probar bien; quizá convertir o mandar tal cual si el STT lo acepta.
- **Costo/clave** del proveedor: definir presupuesto y rotación de la key (no commitear).
- **Latencia**: subir audio + transcribir agrega ~1–3 s; mostrar loader ("Evaluando…", ya existe).

## Decisión pendiente del equipo
1. Proveedor STT (recomendado: OpenAI Whisper API).
2. ¿Reemplazar Web Speech API por STT en todos lados, o STT solo como fallback iOS?
3. Presupuesto/clave del proveedor.
