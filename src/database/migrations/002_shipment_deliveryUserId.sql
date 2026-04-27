-- Migration 002
-- Agrega deliveryUserId a shipment para asignacion de transportista (LGT-25).
-- Idempotente: seguro de re-ejecutar.

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "deliveryUserId" int;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_shipment_deliveryUser'
    ) THEN
        ALTER TABLE "logitrack"."shipment"
            ADD CONSTRAINT "fk_shipment_deliveryUser"
            FOREIGN KEY ("deliveryUserId") REFERENCES "logitrack"."user"("id");
    END IF;
END$$;
