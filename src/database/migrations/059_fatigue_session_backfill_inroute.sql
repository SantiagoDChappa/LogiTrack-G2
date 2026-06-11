-- Backfill: rutas YA en curso (IN_ROUTE = status_id 2) que no tienen sesión de fatiga.
-- Les crea una con un tiempo de manejo SIMULADO (entre 20 y 74 min atrás) para que el
-- chip "Manejo" muestre un valor plausible mientras tanto. Las rutas nuevas ya anclan el
-- conteo al inicio real (ver startDriving en el endpoint de inicio). Idempotente: solo
-- toca rutas sin sesión, así que no pisa conteos existentes y no duplica al re-correr.

INSERT INTO logitrack."route_fatigue_session" ("route_id", "drive_started_at", "state")
SELECT r."id",
       NOW() - ((floor(random() * 55) + 20)::int || ' minutes')::interval,
       'DRIVING'
FROM logitrack."route" r
WHERE r."status_id" = 2
  AND NOT EXISTS (
      SELECT 1 FROM logitrack."route_fatigue_session" s WHERE s."route_id" = r."id"
  );
