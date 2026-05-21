-- Agrega ventana horaria de entrega y prioridad de envío
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "expectedDeliveryFrom" TIME,
    ADD COLUMN IF NOT EXISTS "expectedDeliveryTo"   TIME,
    ADD COLUMN IF NOT EXISTS "priority"             INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "basePriority"         INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP NOT NULL DEFAULT NOW();
