-- Migration 006 - LGT-102
-- Tabla shipment_import: historial de importaciones masivas por CSV.
-- Idempotente: seguro de re-ejecutar.

CREATE TABLE IF NOT EXISTS "logitrack"."shipment_import" (
    "id"             SERIAL       PRIMARY KEY,
    "userId"         INTEGER      NOT NULL,
    "filename"       VARCHAR(255),
    "totalRows"      INTEGER      NOT NULL DEFAULT 0,
    "importedCount"  INTEGER      NOT NULL DEFAULT 0,
    "errorCount"     INTEGER      NOT NULL DEFAULT 0,
    "aborted"        BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_shipmentImport_userId'
    ) THEN
        ALTER TABLE "logitrack"."shipment_import"
            ADD CONSTRAINT "fk_shipmentImport_userId"
            FOREIGN KEY ("userId") REFERENCES "logitrack"."user"("id");
    END IF;
END$$;
