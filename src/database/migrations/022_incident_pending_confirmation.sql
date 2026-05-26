-- 022_incident_pending_confirmation.sql — LGT-47 Tanda D
--
-- Tabla intermedia para guardar incidencias publicas en estado "pendiente de
-- confirmacion por email". El portal publico ya NO crea filas en
-- `incident` directamente; primero crea aca un registro con un token unico,
-- manda un mail al reportante, y recien cuando el reportante hace click en
-- el link de confirmacion (GET /portal/incident/confirm?token=...) se
-- promueve a `incident` real y se elimina la fila pendiente.
--
-- Decisiones de diseño:
-- - El email del reportante debe coincidir con shipment.sender.email o
--   shipment.recipient.email (case-insensitive). Esa validacion vive en
--   el service, no como constraint DB.
-- - Se guarda matchedPersonId / matchedRole para auditoria y para poder
--   poblar openedByPersonId al promover.
-- - expiresAt default now + 24h. Job/lazy cleanup de expirados.
-- - Idempotente.

CREATE TABLE IF NOT EXISTS "logitrack"."incident_pending_confirmation" (
    "id"               SERIAL       PRIMARY KEY,
    "token"            VARCHAR(64)  NOT NULL UNIQUE,
    "shipmentId"       INTEGER      NOT NULL,
    "incidentTypeId"   INTEGER      NOT NULL,
    "description"      TEXT         NOT NULL,
    "reporterName"     VARCHAR(120) NOT NULL,
    "reporterEmail"    VARCHAR(160) NOT NULL,
    "reporterDocument" VARCHAR(20)  NULL,
    "matchedPersonId"  INTEGER      NULL,
    "matchedRole"      VARCHAR(20)  NULL,
    "expiresAt"        TIMESTAMP    NOT NULL,
    "createdAt"        TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_pending_shipment') THEN
        ALTER TABLE "logitrack"."incident_pending_confirmation"
            ADD CONSTRAINT "fk_incident_pending_shipment"
            FOREIGN KEY ("shipmentId") REFERENCES "logitrack"."shipment" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_pending_type') THEN
        ALTER TABLE "logitrack"."incident_pending_confirmation"
            ADD CONSTRAINT "fk_incident_pending_type"
            FOREIGN KEY ("incidentTypeId") REFERENCES "logitrack"."incident_type" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_pending_person') THEN
        ALTER TABLE "logitrack"."incident_pending_confirmation"
            ADD CONSTRAINT "fk_incident_pending_person"
            FOREIGN KEY ("matchedPersonId") REFERENCES "logitrack"."person" ("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_pending_role') THEN
        ALTER TABLE "logitrack"."incident_pending_confirmation"
            ADD CONSTRAINT "chk_incident_pending_role"
            CHECK ("matchedRole" IS NULL OR "matchedRole" IN ('sender', 'recipient'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_pending_expires" ON "logitrack"."incident_pending_confirmation" ("expiresAt");
CREATE INDEX IF NOT EXISTS "idx_incident_pending_shipment" ON "logitrack"."incident_pending_confirmation" ("shipmentId");
