-- #4 Modo offline — idempotencia de las acciones encoladas en el dispositivo.
-- Cada acción lleva un client_action_id único; al sincronizar (o reintentar) el server
-- la aplica una sola vez aunque la cola la reenvíe.
CREATE TABLE IF NOT EXISTS "logitrack"."offline_sync_log" (
    "id"               SERIAL PRIMARY KEY,
    "client_action_id" VARCHAR(80) NOT NULL UNIQUE,
    "user_id"          INTEGER     NULL,
    "action_type"      VARCHAR(20) NULL,
    "created_at"       TIMESTAMP   NOT NULL DEFAULT now()
);
