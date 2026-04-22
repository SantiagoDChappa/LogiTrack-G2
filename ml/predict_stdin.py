import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from predict import predict

data = json.loads(sys.stdin.read())

result = predict(
    distance=data['distance_km'],
    weight=data['weight_kg'],
    quantity=data['package_quantity'],
    ship_type=data['ship_type'],
    day=data['day_of_week'],
    month=data['month'],
    origin=data['origin_province'],
    destination=data['destination_province'],
)

print(json.dumps(result))
