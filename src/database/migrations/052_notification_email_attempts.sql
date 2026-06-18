-- Historial de intentos de envío de cada notificación por email + proveedor usado.
-- Permite ver en la pestaña "Notificaciones → Fallidas" qué pasó con cada mail:
-- por qué proveedor se mandó, cuántas veces se reintentó y con qué error.

-- 1) Proveedor con el que finalmente se envió (o el último intentado). Idempotente.
ALTER TABLE "logitrack"."notification_email"
    ADD COLUMN IF NOT EXISTS "provider" VARCHAR(20) NULL;

-- 2) Tabla de log de intentos (uno por cada try de cada proveedor).
CREATE TABLE IF NOT EXISTS "logitrack"."notification_email_attempt" (
    "id"         SERIAL       PRIMARY KEY,
    "emailId"    INTEGER      NOT NULL,
    "provider"   VARCHAR(20)  NULL,
    "success"    BOOLEAN      NOT NULL DEFAULT false,
    "error"      TEXT         NULL,
    "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_notif_email_attempt_emailId"
    ON "logitrack"."notification_email_attempt" ("emailId");

CREATE INDEX IF NOT EXISTS "idx_notif_email_attempt_at"
    ON "logitrack"."notification_email_attempt" ("attemptedAt" DESC);
