-- Última Milla — radio (km) del aviso "ya casi llego" disparado por GPS.
-- En cada heartbeat se mide la distancia del repartidor a la próxima parada; si está a
-- ≤ este radio, sale el mail con el link al mapa en vivo. Default 1 km, parametrizable
-- hasta 2 km desde Ajustes → Ruteo.
-- Idempotente: corre en cada deploy.
INSERT INTO logitrack.setting ("key", "value")
SELECT 'eta_proximity_km', '1'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.setting WHERE "key" = 'eta_proximity_km');
