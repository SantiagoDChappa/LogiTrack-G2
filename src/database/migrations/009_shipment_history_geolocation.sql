ALTER TABLE "logitrack"."shipment_history"
    ADD COLUMN IF NOT EXISTS "latitude"  DECIMAL(10, 7),
    ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 7);
