import os
import sys

# Asegura que los imports y rutas relativas funcionen desde cualquier directorio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from predict import predict

app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict_route():
    data = request.json
    result = predict(
        distance=data['distance_km'],
        weight=data['weight_kg'],
        quantity=data['package_quantity'],
        ship_type=data['ship_type'],      # 0=Express, 1=Standard
        day=data['day_of_week'],          # 0=Lunes ... 6=Domingo
        month=data['month'],              # 1-12
        origin=data['origin_province'],
        destination=data['destination_province']
    )
    return jsonify(result)

@app.route('/fatigue', methods=['POST'])
def fatigue_route():
    # Ojo de Patron (US-3) — scoring MOCK de fatiga 0-100.
    # Ley 25.326: recibe metricas efimeras (no audio crudo); no persiste nada.
    data = request.json or {}
    method = (data.get('method') or '').upper()
    metrics = data.get('metrics') or {}
    score = 100
    if method == 'REACCION':
        vals = [float(x) for x in (metrics.get('reactionsMs') or []) if x]
        if vals:
            avg = sum(vals) / len(vals)
            score = max(0, min(100, round((avg - 250) / (800 - 250) * 100)))
    elif method == 'VOZ':
        if metrics.get('mockScore') is not None:
            score = max(0, min(100, round(float(metrics['mockScore']))))
        else:
            dur = float(metrics.get('durationMs') or 0)
            expected = float(metrics.get('expectedMs') or 5000) or 5000
            ratio = max(0.0, min(1.0, dur / expected))
            score = max(0, min(100, round(100 - ratio * 85)))
    return jsonify({'score': int(score), 'method': method})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)