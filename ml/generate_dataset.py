import random
import pandas as pd
from faker import Faker

fake = Faker('es_AR')
Faker.seed(42)
random.seed(42)

PROVINCIAS = [
    'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut',
    'Cordoba', 'Corrientes', 'Entre Rios', 'Formosa', 'Jujuy',
    'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquen',
    'Rio Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
    'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
]

DISTANCIA_DESDE_BA = {
    'Buenos Aires': 50,   'CABA': 0,          'Catamarca': 1050,
    'Chaco': 1000,        'Chubut': 1400,      'Cordoba': 700,
    'Corrientes': 1000,   'Entre Rios': 450,   'Formosa': 1150,
    'Jujuy': 1550,        'La Pampa': 550,     'La Rioja': 1100,
    'Mendoza': 1050,      'Misiones': 1250,    'Neuquen': 1150,
    'Rio Negro': 1200,    'Salta': 1450,       'San Juan': 1100,
    'San Luis': 800,      'Santa Cruz': 2100,  'Santa Fe': 500,
    'Santiago del Estero': 1050, 'Tierra del Fuego': 3000, 'Tucuman': 1250,
}

def calculate_distance(origin, destination):
    base  = abs(DISTANCIA_DESDE_BA[origin] - DISTANCIA_DESDE_BA[destination])
    base  = max(base, 100)
    noise = random.randint(-80, 80)
    return max(50, base + noise)

def calculate_delay(distance, weight, quantity, ship_type, day, month):
    # ── Probabilidad base muy diferente según tipo de envío ──────────────────
    # Express: prioridad alta, manejo especial → mucho menos riesgo de demora
    # Standard: procesamiento normal → riesgo base mayor
    if ship_type == 0:   # Express
        probability = 0.05
    else:                # Standard
        probability = 0.35

    # ── Factores de riesgo — impacto diferente según tipo ────────────────────
    if distance > 1500:
        probability += 0.30 if ship_type == 1 else 0.08
    elif distance > 800:
        probability += 0.18 if ship_type == 1 else 0.04
    elif distance > 400:
        probability += 0.08 if ship_type == 1 else 0.02

    if weight > 30:
        probability += 0.15 if ship_type == 1 else 0.05
    elif weight > 15:
        probability += 0.08 if ship_type == 1 else 0.02

    if quantity > 15:
        probability += 0.12 if ship_type == 1 else 0.04
    elif quantity > 7:
        probability += 0.06 if ship_type == 1 else 0.01

    # Días de alta demanda
    if day in (0, 4):
        probability += 0.12 if ship_type == 1 else 0.02

    # Temporada alta (noviembre-diciembre)
    if month in (11, 12):
        probability += 0.20 if ship_type == 1 else 0.05

    # Envío simple y cercano: reduce demora (corta distancia + liviano + pocos paquetes)
    if distance <= 300 and weight <= 10 and quantity <= 3:
        probability -= 0.18 if ship_type == 1 else 0.03

    return 1 if random.random() < min(max(probability, 0.0), 1.0) else 0

def calculate_delivery_days(distance, ship_type, delayed):
    # ── Días base según tipo y distancia — diferencia muy marcada ────────────
    if ship_type == 0:   # Express: entregas rápidas garantizadas
        if distance <= 150:    base_days = 1
        elif distance <= 400:  base_days = 1
        elif distance <= 800:  base_days = 2
        elif distance <= 1500: base_days = 2
        elif distance <= 2500: base_days = 3
        else:                  base_days = 4
    else:                # Standard: procesamiento normal
        if distance <= 150:    base_days = 3
        elif distance <= 400:  base_days = 5
        elif distance <= 800:  base_days = 7
        elif distance <= 1500: base_days = 10
        elif distance <= 2500: base_days = 14
        else:                  base_days = 18

    # ── Penalidad por demora — acotada según distancia ──────────────────────
    if delayed == 1:
        if ship_type == 0:
            base_days += random.randint(1, 2)   # Express: demora moderada
        else:
            if distance <= 300:
                base_days += random.randint(1, 3)   # Standard cercano: demora leve
            elif distance <= 800:
                base_days += random.randint(2, 5)   # Standard medio: demora moderada
            else:
                base_days += random.randint(3, 8)   # Standard lejano: demora significativa

    return base_days

def generate_dataset(n_rows=20000):
    rows = []
    for i in range(1, n_rows + 1):
        origin      = random.choice(PROVINCIAS)
        destination = random.choice(PROVINCIAS)
        distance    = calculate_distance(origin, destination)
        weight      = round(random.uniform(0.5, 50.0), 2)
        quantity    = random.randint(1, 20)
        ship_type   = random.choice([0, 1])
        day         = random.randint(0, 6)
        month       = random.randint(1, 12)
        delayed     = calculate_delay(distance, weight, quantity, ship_type, day, month)
        delivery_days = calculate_delivery_days(distance, ship_type, delayed)

        rows.append({
            'tracking_id':          f'ENV-{str(i).zfill(4)}',
            'sender':               fake.name(),
            'recipient':            fake.name(),
            'origin_province':      origin,
            'destination_province': destination,
            'distance_km':          distance,
            'weight_kg':            weight,
            'package_quantity':     quantity,
            'ship_type':            ship_type,
            'day_of_week':          day,
            'month':                month,
            'delayed':              delayed,
            'delivery_days':        delivery_days,
        })

    return pd.DataFrame(rows)

if __name__ == '__main__':
    import os
    os.makedirs('dataset', exist_ok=True)

    df = generate_dataset()
    df.to_csv('dataset/shipments.csv', index=False, encoding='utf-8')

    express  = df[df['ship_type'] == 0]
    standard = df[df['ship_type'] == 1]

    print(f'Dataset generado: dataset/shipments.csv')
    print(f'  Total filas     : {len(df)}')
    print()
    print(f'  EXPRESS  — Demora: {express["delayed"].mean()*100:.1f}%  | Días prom: {express["delivery_days"].mean():.1f}')
    print(f'  STANDARD — Demora: {standard["delayed"].mean()*100:.1f}%  | Días prom: {standard["delivery_days"].mean():.1f}')
    print()
    print(df.head(5).to_string(index=False))
