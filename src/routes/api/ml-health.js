const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

router.get('/', (req, res) => {
    const results = [];
    
    // Check main.py execution
    try {
        execSync('python3 ml/main.py --check-imports', { encoding: 'utf-8' });
        results.push({ name: 'ML Imports', status: 'ok' });
    } catch (error) {
        results.push({ name: 'ML Imports', status: 'error', message: error.message });
    }

    const allOk = results.every(r => r.status === 'ok');
    res.status(allOk ? 200 : 500).json({
        status: allOk ? 'ok' : 'error',
        components: results
    });
});

module.exports = router;
