const { spawn, execSync } = require('child_process');
const path = require('path');
const express = require('express');
const router = express.Router();

const PYTHON = process.env.PYTHON_BIN || 'python3';
const SCRIPT = path.join(__dirname, '../../../ml/predict_stdin.py');

// GET /api/ml-health  — diagnóstico del servicio ML
router.get('/', (req, res) => {
    const info = { python_bin: PYTHON, script: SCRIPT };

    // 1. ¿Existe el binario?
    try {
        info.python_version = execSync(`${PYTHON} --version 2>&1`).toString().trim();
    } catch (e) {
        info.python_version = `ERROR: ${e.message}`;
        return res.status(500).json(info);
    }

    // 2. ¿Se pueden importar las dependencias?
    const checkImports = spawn(PYTHON, ['-c', 'import pandas, joblib, sklearn, numpy; print("OK")']);
    let importOut = '';
    let importErr = '';
    checkImports.stdout.on('data', d => { importOut += d; });
    checkImports.stderr.on('data', d => { importErr += d; });
    checkImports.on('close', code => {
        info.imports = code === 0 ? 'OK' : `FAIL (code ${code}): ${importErr.trim()}`;

        // 3. ¿Corre el script con datos de prueba?
        const testPayload = JSON.stringify({
            distance_km: 300, weight_kg: 5, package_quantity: 2,
            ship_type: 'Estándar', day_of_week: 'Monday', month: 3,
            origin_province: 'Buenos Aires', destination_province: 'Córdoba',
        });

        const proc = spawn(PYTHON, [SCRIPT]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => { stderr += d; });
        proc.on('close', code2 => {
            info.test_run = {
                exit_code: code2,
                stdout:    stdout.trim().slice(0, 500),
                stderr:    stderr.trim().slice(0, 500),
            };
            res.status(code2 === 0 ? 200 : 500).json(info);
        });
        proc.on('error', err => {
            info.test_run = { spawn_error: err.message };
            res.status(500).json(info);
        });
        proc.stdin.write(testPayload);
        proc.stdin.end();
    });
});

module.exports = router;
