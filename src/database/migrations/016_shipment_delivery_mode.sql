-- Sprint 3 - HU 3.1: Envío a domicilio o retiro por sucursal
-- Agrega modalidad de entrega y sucursal de retiro al envío
-- Marca sucursales habilitadas para retiro

ALTER TABLE "logitrack"."branch"
    ADD COLUMN IF NOT EXISTS "pickup_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "delivery_mode"     VARCHAR(20) NOT NULL DEFAULT 'home',
    ADD COLUMN IF NOT EXISTS "pickup_branch_id"  INTEGER NULL;

ALTER TABLE "logitrack"."shipment"
    DROP CONSTRAINT IF EXISTS "chk_shipment_delivery_mode";
ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "chk_shipment_delivery_mode"
    CHECK ("delivery_mode" IN ('home','branch_pickup'));

ALTER TABLE "logitrack"."shipment"
    DROP CONSTRAINT IF EXISTS "chk_shipment_pickup_branch_required";
ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "chk_shipment_pickup_branch_required"
    CHECK (
        ("delivery_mode" = 'home')
        OR ("delivery_mode" = 'branch_pickup' AND "pickup_branch_id" IS NOT NULL)
    );

ALTER TABLE "logitrack"."shipment"
    DROP CONSTRAINT IF EXISTS "fk_shipment_pickup_branch";
ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_pickup_branch"
    FOREIGN KEY ("pickup_branch_id") REFERENCES "logitrack"."branch" ("id");

CREATE INDEX IF NOT EXISTS "idx_shipment_pickup_branch_id"
    ON "logitrack"."shipment" ("pickup_branch_id");

CREATE INDEX IF NOT EXISTS "idx_shipment_delivery_mode"
    ON "logitrack"."shipment" ("delivery_mode");
