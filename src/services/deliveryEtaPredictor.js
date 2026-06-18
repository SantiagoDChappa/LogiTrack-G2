// Recalcula la fecha estimada de entrega de un envío usando el modelo ML, asumiendo
// modalidad EXPRESS (ship_type=0) para darle al destinatario la fecha más pronta
// posible cuando su envío se demoró. Pensado para el portal de autogestión:
//   - NO usa Nominatim (geocodificación lenta): toma la distancia ya calculada en la
//     última predicción del envío, o el centroide de la provincia destino (haversine puro).
//   - El spawn de Python tiene timeout: si el ML no está disponible (p.ej. Render sin
//     Python) o tarda, cae a una estimación heurística rápida. Nunca cuelga la request.

const path = require('path');
const { spawn } = require('child_process');
const { PROVINCES } = require('../utils/provinces');
const { haversine } = require('../utils/geo');
const settingModel = require('../models/setting');
const { addBusinessDays, estimateDeliveryDate } = require('../utils/deliveryEstimate');
const shipmentPredictionModel = require('../models/shipmentPrediction');

const PYTHON = process.env.PYTHON_BIN || 'python3';
const SCRIPT = path.join(__dirname, '../../ml/predict_stdin.py');
const ML_TIMEOUT_MS = Number(process.env.ML_PREDICT_TIMEOUT_MS) || 3500;

// Ejecuta el predictor Python con timeout. Resuelve { days, probability, delayed } o null.
function runMlPredict(features) {
    return new Promise((resolve) => {
        let proc;
        try { proc = spawn(PYTHON, [SCRIPT]); } catch { return resolve(null); }

        let stdout = '';
        let settled = false;
        const finish = (val) => {
            if (settled) { return; }
            settled = true;
            try { proc.kill(); } catch { /* ya terminó */ }
            resolve(val);
        };
        const timer = setTimeout(() => finish(null), ML_TIMEOUT_MS);

        proc.stdout.on('data', (c) => { stdout += c; });
        proc.on('error', () => { clearTimeout(timer); finish(null); });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) { return finish(null); }
            try {
                const p = JSON.parse(stdout);
                finish({ days: Number(p.delivery_days), probability: p.probability, delayed: p.delayed });
            } catch { finish(null); }
        });

        try { proc.stdin.write(JSON.stringify(features)); proc.stdin.end(); }
        catch { clearTimeout(timer); finish(null); }
    });
}

// Arma el vector de features para el ML a partir del envío. express=true → ship_type 0.
async function buildFeatures(shipment, { express = true } = {}) {
    let distanceKm = null;
    try {
        const preds = await shipmentPredictionModel.getByShipmentId(shipment.id);
        if (preds && preds[0] && preds[0].distanceKm !== null && preds[0].distanceKm !== undefined) {
            distanceKm = Number(preds[0].distanceKm);
        }
    } catch { /* sin predicción previa: usamos centroide */ }

    const destProvince = PROVINCES[Number(shipment.address?.provinceId)] || null;

    let oLat = -34.6037; let oLng = -58.3816; let originMl = 'CABA';
    try {
        const [la, lo, ml] = await Promise.all([
            settingModel.get('origin_lat'),
            settingModel.get('origin_lng'),
            settingModel.get('origin_province_ml'),
        ]);
        if (la) { oLat = parseFloat(la); }
        if (lo) { oLng = parseFloat(lo); }
        if (ml) { originMl = ml; }
    } catch { /* defaults CABA */ }

    if (distanceKm === null && destProvince) {
        distanceKm = haversine(oLat, oLng, destProvince.lat, destProvince.lng);
    }
    if (distanceKm === null) { return null; }

    const now = new Date();
    return {
        distance_km:          distanceKm,
        weight_kg:            Number(shipment.weightKg) || 1,
        package_quantity:     Number(shipment.packageQty) || 1,
        ship_type:            express ? 0 : 1,        // 0=Express, 1=Estándar
        day_of_week:          (now.getDay() + 6) % 7, // ML espera 0=Lun…6=Dom
        month:                now.getMonth() + 1,
        origin_province:      originMl,
        destination_province: destProvince ? destProvince.ml : originMl,
    };
}

// Recalcula la fecha de entrega EXPRESS. Devuelve:
//   { date: Date, days: number|null, probability: number|null, source: 'ml'|'heuristic' }
// Nunca lanza: ante cualquier fallo cae a la heurística.
async function predictExpressEta(shipment) {
    try {
        const features = await buildFeatures(shipment, { express: true });
        if (features) {
            const ml = await runMlPredict(features);
            if (ml && Number.isFinite(ml.days) && ml.days > 0) {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + ml.days); // días calendario (igual que prediction.js)
                return { date: d, days: ml.days, probability: ml.probability ?? null, source: 'ml' };
            }
        }
    } catch { /* cae a heurística */ }

    // Fallback express: 1 día hábil (más pronto que el estándar a domicilio = 3).
    return { date: addBusinessDays(new Date(), 1), days: null, probability: null, source: 'heuristic' };
}

module.exports = { predictExpressEta, runMlPredict, buildFeatures, estimateDeliveryDate };
