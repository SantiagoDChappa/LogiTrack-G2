const { spawn } = require('child_process');
const path = require('path');
const express = require('express');
const router = express.Router();
const { savePrediction } = require('../../models/shipmentPrediction');

const PYTHON = process.env.PYTHON_BIN || 'python3';
const SCRIPT = path.join(__dirname, '../../../ml/predict_stdin.py');

router.post('/', async (req, res) => {
    const proc = spawn(PYTHON, [SCRIPT]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('close', async (code) => {
        if (code !== 0) {
            console.error('ML process error:', stderr);
            return res.status(503).json({ error: 'Servicio ML no disponible' });
        }
        try {
            const pred = JSON.parse(stdout);

            // Guardar predicción si viene con shipmentId
            if (req.body.shipmentId) {
                await savePrediction({
                    shipmentId:       req.body.shipmentId,
                    predictedDays:    pred.delivery_days,
                    delayProbability: pred.probability,
                    delayed:          pred.delayed,
                    distanceKm:       req.body.distance_km,
                });
            }

            res.json(pred);
        } catch {
            console.error('ML bad output:', stdout);
            res.status(503).json({ error: 'Respuesta ML inválida' });
        }
    });

    proc.on('error', err => {
        console.error('ML spawn error:', err);
        res.status(503).json({ error: 'Servicio ML no disponible' });
    });

    proc.stdin.write(JSON.stringify(req.body));
    proc.stdin.end();
});

module.exports = router;