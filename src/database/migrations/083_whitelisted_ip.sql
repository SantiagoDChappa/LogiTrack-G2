-- LGT-193 — IPs de confianza (ej. la oficina) que nunca se bloquean automáticamente,
-- aunque disparen el patrón de "misma IP en 2+ cuentas bloqueadas".
CREATE TABLE IF NOT EXISTS logitrack.whitelisted_ip (
    id         SERIAL PRIMARY KEY,
    ip         VARCHAR(45) NOT NULL UNIQUE,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
