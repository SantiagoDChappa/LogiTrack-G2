# Fatiga vocal por análisis ACÚSTICO (rama `feature/voz-acustica`)

> Mide la **fatiga de la voz de verdad** (no solo si leíste la frase), analizando la
> onda del audio en el navegador. Costo de plata: **$0** (Web Audio, client-side; sin
> API paga, sin servidor extra). Audio **efímero** (Ley 25.326): se analiza y se
> descarta; al server solo va el puntaje.

## Idea
La prueba de voz separa dos cosas:
1. **Gate de frase** — ¿leíste la frase pedida? (coincidencia ≥ 95%, vía STT). Si no,
   reintenta. Esto NO es fatiga, es cooperación/cognición.
2. **Fatiga vocal** — cómo suena tu voz. Se calcula con análisis acústico del audio
   grabado y es el puntaje que se compara contra el umbral de bloqueo.

Antes la "fatiga de voz" era un proxy del match de la frase (leer bien = no fatiga).
Ahora la fatiga sale de marcadores acústicos reales.

## Qué mide (Web Audio, `extraerFeaturesVoz` en `route.ejs`)
Sobre el waveform decodificado (`AudioContext.decodeAudioData`):
- **Velocidad de habla** — arranques de voz por segundo (energía por frames de 30 ms).
- **Ratio de pausas** — proporción de silencio (frames bajo umbral de energía).
- **Tono F0** — frecuencia fundamental por **autocorrelación** (70–350 Hz) en frames con voz.
- **Variabilidad de tono (F0 CV)** — desvío/media de F0 (bajo = monótono).
- **Dinámica de energía (RMS CV)** — variación del volumen.

## Puntaje (`scoreAcusticoVoz`)
Heurística sobre marcadores conocidos de fatiga vocal (calibrable):
```
fatiga = 0.35·habla_lenta + 0.30·muchas_pausas + 0.20·tono_monótono + 0.15·poca_dinámica
```
Cada término normalizado 0..1; resultado 0..100. Pesos y umbrales en `scoreAcusticoVoz`.

## Flujo
1. Conductor lee la frase (camino de grabación: `pruebaVozSTT`).
2. Server (STT) valida la frase → `matchRatio`.
3. Si `matchRatio ≥ 0.95` → el navegador analiza el blob (`extraerFeaturesVoz`) y calcula
   `acousticScore`.
4. Se envía `metrics.acousticScore` a `/fatigue-check`. `scorer.scoreFromVoice` lo usa con
   prioridad (sobre `matchRatio`/duración). El umbral de bloqueo decide apto/bloqueado.
5. Logs `acustico` (features + score) van al server (Render) para calibrar.

## Activación
- Requiere **STT activo** (graba el audio): `GROQ_API_KEY` (free, console.groq.com).
- Flag `voiceAcousticEnabled` (default `true`) en Ajustes → Ojo de Patrón. Si está OFF, o
  no hay STT, se cae al gate de frase (comportamiento anterior).
- Con `voiceAcousticEnabled + STT`, **todos** los dispositivos (incl. iOS) usan el camino
  de grabación, así el acústico corre en cualquier lado.

## Cómo calibrar
1. Activá el flag + Groq key. Hacé la prueba en estado normal y "cansado" (lento, monótono).
2. Mirá los logs de Render: `[fatiga-voz] acustico {"feats":{...},"acousticScore":N}`.
3. Ajustá umbrales/pesos en `scoreAcusticoVoz` (route.ejs) según tus `feats` reales.

## Límites (honestos)
- Es **heurística sobre features reales**, no un modelo ML entrenado (no hay dataset
  etiquetado fatigado/no). Los umbrales requieren calibración.
- Jitter/shimmer finos (Praat-level) no se calculan; se usan velocidad, pausas, F0 y energía,
  que son robustos en el navegador.
- El análisis depende de un audio decodificable; si falla, cae al gate de frase.
- No reemplaza una evaluación médica; es una señal de aptitud operativa.

## Próximos pasos (opcional)
- Camino Web Speech sin STT: agregar grabación en paralelo para tener acústico sin Groq.
- Jitter/shimmer y más features con un servicio Python (librosa/parselmouth) si se quiere
  precisión clínica (eso sí tendría costo de infra).
