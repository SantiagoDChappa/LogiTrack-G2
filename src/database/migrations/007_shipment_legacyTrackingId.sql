-- Migration 007 - LGT-102 (extensión de duplicados)
-- Agrega legacyTrackingId a shipment para detectar reimports idempotentes,
-- y duplicateCount/forced a shipment_import para reflejar dedup en el historial.
-- Idempotente: seguro de re-ejecutar.

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "legacyTrackingId" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "idx_shipment_legacyTrackingId"
    ON "logitrack"."shipment" ("legacyTrackingId");

ALTER TABLE "logitrack"."shipment_import"
    ADD COLUMN IF NOT EXISTS "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "forced"         BOOLEAN NOT NULL DEFAULT false;
