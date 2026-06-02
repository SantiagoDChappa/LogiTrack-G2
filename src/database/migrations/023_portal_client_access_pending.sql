-- 023_portal_client_access_pending.sql — Portal Mis Envíos (HU 1)
--
-- Tabla para confirmación por email antes de otorgar acceso al listado
-- de envíos del cliente en el portal público.
-- Idempotente.

CREATE TABLE IF NOT EXISTS "logitrack"."portal_client_access_pending" (
    "id"        SERIAL       PRIMARY KEY,
    "token"     VARCHAR(64)  NOT NULL UNIQUE,
    "document"  INTEGER      NOT NULL,
    "email"     VARCHAR(160) NOT NULL,
    "expiresAt" TIMESTAMP    NOT NULL,
    "createdAt" TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_portal_client_access_expires"
    ON "logitrack"."portal_client_access_pending" ("expiresAt");

CREATE INDEX IF NOT EXISTS "idx_portal_client_access_document"
    ON "logitrack"."portal_client_access_pending" ("document");
