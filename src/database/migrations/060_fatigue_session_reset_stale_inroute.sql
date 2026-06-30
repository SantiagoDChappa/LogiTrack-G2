-- Rutas en curso (IN_ROUTE) cuya sesión de fatiga quedó con un drive_started_at viejo
-- (rutas que estuvieron "en ruta" días) muestran un "Manejo" absurdo (ej: 6076/90 min).
-- Las reseteamos a un tiempo de manejo SIMULADO razonable (20-74 min atrás), estado
-- DRIVING limpio. Solo toca sesiones con más de 3 horas de manejo acumulado, así no pisa
-- rutas recién iniciadas (que ya anclan al inicio real vía startDriving). Es "por ahora",
-- mientras los datos de ruteo en curso son de prueba.

UPDATE logitrack."route_fatigue_session" s
SET "drive_started_at"     = NOW() - ((floor(random() * 55) + 20)::int || ' minutes')::interval,
    "state"                = 'DRIVING',
    "stopped_at"           = NULL,
    "recheck_requested_at" = NULL,
    "paused_at"            = NULL,
    "rest_until"           = NULL,
    "updated_at"           = NOW()
FROM logitrack."route" r
WHERE s."route_id" = r."id"
  AND r."status_id" = 2
  AND (s."drive_started_at" IS NULL OR s."drive_started_at" < NOW() - INTERVAL '3 hours');
