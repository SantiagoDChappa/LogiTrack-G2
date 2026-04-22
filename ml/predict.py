import pandas as pd
import joblib
import os

PROVINCES = [
    'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut',
    'Cordoba', 'Corrientes', 'Entre Rios', 'Formosa', 'Jujuy',
    'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquen',
    'Rio Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
    'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
]

DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']

# ── Carga de modelos ───────────────────────────────────────────────────────────

def load_models():
    if not os.path.exists('model/delay_model.pkl'):
        print('ERROR: Models not found. Run train_model.py first.')
        exit(1)

    classifier = joblib.load('model/delay_model.pkl')
    regressor  = joblib.load('model/days_model.pkl')
    columns    = joblib.load('model/columns.pkl')
    return classifier, regressor, columns

# ── Preparacion del input ──────────────────────────────────────────────────────

def prepare_input(distance, weight, quantity, ship_type, day, month, origin, destination, model_columns):
    row = {
        'distance_km':      distance,
        'weight_kg':        weight,
        'package_quantity': quantity,
        'ship_type':        ship_type,
        'day_of_week':      day,
        'month':            month,
    }

    for province in PROVINCES:
        row[f'origin_province_{province}']      = 1 if province == origin      else 0
        row[f'destination_province_{province}'] = 1 if province == destination else 0

    df = pd.DataFrame([row])

    for col in model_columns:
        if col not in df.columns:
            df[col] = 0

    return df[model_columns]

# ── Prediccion ─────────────────────────────────────────────────────────────────

def predict(distance, weight, quantity, ship_type, day, month, origin, destination):
    classifier, regressor, columns = load_models()

    X = prepare_input(distance, weight, quantity, ship_type, day, month, origin, destination, columns)

    # Modelo 1: clasificacion (demorado si/no)
    delayed     = classifier.predict(X)[0]
    probability = classifier.predict_proba(X)[0][1]

    # Modelo 2: regresion (cuantos dias tarda)
    delivery_days = round(regressor.predict(X)[0])

    return {
        'delayed':        bool(delayed),
        'probability':    round(float(probability) * 100, 1),
        'label':          'DELAYED' if delayed == 1 else 'ON TIME',
        'delivery_days':  int(delivery_days),
    }

# ── Display ────────────────────────────────────────────────────────────────────

def print_result(result, distance, weight, quantity, ship_type, day, month, origin, destination):
    ship_type_label = 'Express' if ship_type == 0 else 'Standard'

    print()
    print('-' * 45)
    print('  SHIPMENT PREDICTION — LogiTrack ML')
    print('-' * 45)
    print(f'  Origin        : {origin}')
    print(f'  Destination   : {destination}')
    print(f'  Distance      : {distance} km')
    print(f'  Weight        : {weight} kg')
    print(f'  Packages      : {quantity}')
    print(f'  Ship type     : {ship_type_label}')
    print(f'  Day           : {DAYS[day]}')
    print(f'  Month         : {MONTHS[month]}')
    print('-' * 45)
    print(f'  Result        : {result["label"]}')
    print(f'  Delay prob.   : {result["probability"]}%')
    print(f'  Estimated days: {result["delivery_days"]} day(s)')
    print('-' * 45)

# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    examples = [
        dict(distance=200,  weight=2.0,  quantity=1,  ship_type=0, day=2, month=6,  origin='CABA',    destination='Buenos Aires'),
        dict(distance=1500, weight=30.0, quantity=15, ship_type=1, day=0, month=12, origin='Tucuman', destination='CABA'),
        dict(distance=700,  weight=5.0,  quantity=3,  ship_type=1, day=4, month=11, origin='Cordoba', destination='Santa Fe'),
        dict(distance=3000, weight=50.0, quantity=20, ship_type=1, day=0, month=12, origin='Tierra del Fuego', destination='CABA'),
    ]

    for example in examples:
        result = predict(
            example['distance'], example['weight'],  example['quantity'],
            example['ship_type'], example['day'],    example['month'],
            example['origin'],    example['destination']
        )
        print_result(
            result,
            example['distance'], example['weight'],  example['quantity'],
            example['ship_type'], example['day'],    example['month'],
            example['origin'],    example['destination']
        )
