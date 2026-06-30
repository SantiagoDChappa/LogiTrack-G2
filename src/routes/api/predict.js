const express = require('express');
const router = express.Router();
const { savePrediction } = require('../../models/shipmentPrediction');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5001/predict';

function heuristicPrediction(shipType) {
    const days = shipType === 0 ? 2 : 5;
    return {
        delivery_days: days,
        probability: 0,
        delayed: false,
        label: 'ESTIMATED',
    };
}

router.post('/', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let flaskRes;
        try {
            flaskRes = await fetch(ML_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!flaskRes.ok) throw new Error(`Flask status ${flaskRes.status}`);

        const pred = await flaskRes.json();

        if (req.body.shipmentId) {
            savePrediction({
                shipmentId: req.body.shipmentId,
                predictedDays: pred.delivery_days,
                delayProbability: pred.probability,
                delayed: pred.delayed,
                distanceKm: req.body.distance_km,
            }).catch(() => {});
        }

        res.json(pred);
    } catch (err) {
        console.error('[predict] ML API error, usando heurística:', err.message);
        const fallback = heuristicPrediction(req.body.ship_type);

        if (req.body.shipmentId) {
            savePrediction({
                shipmentId: req.body.shipmentId,
                predictedDays: fallback.delivery_days,
                delayProbability: 0,
                delayed: false,
                distanceKm: req.body.distance_km,
            }).catch(() => {});
        }

        res.json(fallback);
    }
});

module.exports = router;