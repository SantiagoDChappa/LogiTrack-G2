-- Evita que vuelvan a duplicarse las zonas (la DB tenía ~9888 copias de 6 zonas
-- de CABA). Único por (nombre, provincia). COALESCE para tratar province_id NULL
-- como un valor concreto (UNIQUE normal considera cada NULL distinto y dejaría
-- pasar duplicados sin provincia). Idempotente: IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_name_province
    ON logitrack.zone (name, COALESCE(province_id, -1));
