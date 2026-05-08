ALTER TABLE "logitrack"."deliveryEvidence"
    ADD COLUMN IF NOT EXISTS "photoBase64" TEXT,
    ADD COLUMN IF NOT EXISTS "signatureBase64" TEXT,
    ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10, 7),
    ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 7);