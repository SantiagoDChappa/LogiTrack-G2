/* global FormData, Blob */
// Ojo de Patrón — Speech-to-Text server-side para la prueba de voz (compatible iOS).
// El audio se procesa de forma EFÍMERA: se transcribe y se descarta, nunca se
// guarda (Ley 25.326). Solo se conserva el puntaje de coincidencia.
//
// Proveedor por defecto: Groq (hostea Whisper, API compatible OpenAI, free tier).
//   - Sacá una API key gratis en https://console.groq.com  → variable GROQ_API_KEY
//   - Opcional: STT_PROVIDER=groq (default) · GROQ_STT_MODEL=whisper-large-v3-turbo
// Si no hay key, isEnabled() = false y el flujo cae al método del navegador.

const PROVIDER = (process.env.STT_PROVIDER || 'groq').toLowerCase();

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

function isEnabled() {
    if (PROVIDER === 'groq') { return !!process.env.GROQ_API_KEY; }
    if (PROVIDER === 'openai') { return !!process.env.OPENAI_API_KEY; }
    return false;
}

// buffer: Buffer con el audio. opts: { mimeType, filename, language }. Devuelve Promise<texto>.
function transcribe(buffer, { mimeType = 'audio/webm', filename = 'voz.webm', language = 'es' } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) { throw new Error('Audio vacío'); }
    if (PROVIDER === 'groq')   { return transcribeOpenAiCompatible(GROQ_URL, process.env.GROQ_API_KEY, GROQ_MODEL, buffer, mimeType, filename, language); }
    if (PROVIDER === 'openai') {
        return transcribeOpenAiCompatible('https://api.openai.com/v1/audio/transcriptions',
            process.env.OPENAI_API_KEY, process.env.OPENAI_STT_MODEL || 'whisper-1', buffer, mimeType, filename, language);
    }
    throw new Error('STT no configurado (STT_PROVIDER inválido)');
}

// Endpoint OpenAI-compatible (Groq y OpenAI comparten contrato multipart).
async function transcribeOpenAiCompatible(url, apiKey, model, buffer, mimeType, filename, language) {
    if (!apiKey) { throw new Error('Falta la API key del proveedor STT'); }
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType }), filename);
    fd.append('model', model);
    fd.append('language', language);
    fd.append('response_format', 'text');
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`STT ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.text()).trim();
}

module.exports = { isEnabled, transcribe, PROVIDER };
