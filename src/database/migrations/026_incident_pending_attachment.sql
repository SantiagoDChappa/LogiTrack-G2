-- Migration 026 - Adjunto en el flujo de confirmación de incidencias del portal
-- Permite conservar la evidencia subida en el alta pública hasta que el reportante
-- confirma por email; al confirmar se promueve a incident_attachment.
-- Idempotente.

ALTER TABLE "logitrack"."incident_pending_confirmation"
    ADD COLUMN IF NOT EXISTS "attachmentName" VARCHAR(200) NULL;
ALTER TABLE "logitrack"."incident_pending_confirmation"
    ADD COLUMN IF NOT EXISTS "attachmentMime" VARCHAR(80)  NULL;
ALTER TABLE "logitrack"."incident_pending_confirmation"
    ADD COLUMN IF NOT EXISTS "attachmentData" TEXT         NULL;
