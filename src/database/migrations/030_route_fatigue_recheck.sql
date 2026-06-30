-- Ojo de Patrón (LGT-199) — estado del re-chequeo de fatiga durante la ruta.
-- Una fila por ruta: rastrea el tramo de conducción, la detención manual
-- ("Estoy detenido") y el descanso para reintentar tras un bloqueo en viaje.

CREATE TABLE IF NOT EXISTS "logitrack"."route_fatigue_session" (
    "id"                   SERIAL PRIMARY KEY,
    "route_id"             INTEGER NOT NULL UNIQUE,
    "drive_started_at"     TIMESTAMP,
    "stopped_at"           TIMESTAMP,
    "recheck_requested_at" TIMESTAMP,
    "paused_at"            TIMESTAMP,
    "rest_until"           TIMESTAMP,
    "state"                VARCHAR(20) NOT NULL DEFAULT 'DRIVING',  -- DRIVING | STOPPED | RECHECK_PENDING | PAUSED
    "updated_at"           TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_rfs_route" FOREIGN KEY ("route_id") REFERENCES "logitrack"."route"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_route_fatigue_session_route"
    ON "logitrack"."route_fatigue_session" ("route_id");
