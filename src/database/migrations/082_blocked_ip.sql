-- LGT-193 — bloqueo automático de IP cuando se detecta el mismo origen atacando
-- a 2+ cuentas distintas en simultáneo (patrón de ataque coordinado, no error de un usuario).
CREATE TABLE IF NOT EXISTS logitrack.blocked_ip (
    id          SERIAL PRIMARY KEY,
    ip          VARCHAR(45) NOT NULL UNIQUE,
    reason      TEXT,
    blocked_until TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blocked_ip_until ON logitrack.blocked_ip(blocked_until);
