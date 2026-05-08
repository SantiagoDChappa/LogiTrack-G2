-- Migration 010 - LGT-134: Route optimization (zones, transports, routes, route_stops)
-- Idempotente: seguro de re-ejecutar.

-- Zone: barrios CABA + provincias (jerarquia mixta)
CREATE TABLE IF NOT EXISTS "logitrack"."zone" (
    "id"                   SERIAL          PRIMARY KEY,
    "name"                 VARCHAR(150)    NOT NULL,
    "province_id"          INTEGER         NULL,
    "base_cost"            DECIMAL(10,2)   NOT NULL DEFAULT 0,
    "postal_code_prefixes" JSONB           NULL,
    "enabled"              BOOLEAN         NOT NULL DEFAULT true
);

ALTER TABLE "logitrack"."zone"
    DROP CONSTRAINT IF EXISTS "fk_zone_province";
ALTER TABLE "logitrack"."zone"
    ADD CONSTRAINT "fk_zone_province"
        FOREIGN KEY ("province_id") REFERENCES "logitrack"."province" ("id");

-- Transport: vehiculos con capacidad, costos y conductor
CREATE TABLE IF NOT EXISTS "logitrack"."transport" (
    "id"              SERIAL          PRIMARY KEY,
    "name"            VARCHAR(150)    NOT NULL,
    "plate"           VARCHAR(20)     NULL,
    "max_weight_kg"   DECIMAL(10,2)   NOT NULL,
    "max_volume_m3"   DECIMAL(10,3)   NOT NULL,
    "fixed_cost"      DECIMAL(10,2)   NOT NULL DEFAULT 0,
    "cost_per_km"     DECIMAL(10,2)   NOT NULL DEFAULT 0,
    "driver_user_id"  INTEGER         NULL,
    "branch_id"       INTEGER         NULL,
    "enabled"         BOOLEAN         NOT NULL DEFAULT true
);

ALTER TABLE "logitrack"."transport"
    DROP CONSTRAINT IF EXISTS "fk_transport_driver";
ALTER TABLE "logitrack"."transport"
    ADD CONSTRAINT "fk_transport_driver"
        FOREIGN KEY ("driver_user_id") REFERENCES "logitrack"."user" ("id");

ALTER TABLE "logitrack"."transport"
    DROP CONSTRAINT IF EXISTS "fk_transport_branch";
ALTER TABLE "logitrack"."transport"
    ADD CONSTRAINT "fk_transport_branch"
        FOREIGN KEY ("branch_id") REFERENCES "logitrack"."branch" ("id");

-- Transport <-> Zone N:M
CREATE TABLE IF NOT EXISTS "logitrack"."transport_zone" (
    "transport_id" INTEGER NOT NULL,
    "zone_id"      INTEGER NOT NULL,
    PRIMARY KEY ("transport_id", "zone_id")
);

ALTER TABLE "logitrack"."transport_zone"
    DROP CONSTRAINT IF EXISTS "fk_tz_transport";
ALTER TABLE "logitrack"."transport_zone"
    ADD CONSTRAINT "fk_tz_transport"
        FOREIGN KEY ("transport_id") REFERENCES "logitrack"."transport" ("id") ON DELETE CASCADE;

ALTER TABLE "logitrack"."transport_zone"
    DROP CONSTRAINT IF EXISTS "fk_tz_zone";
ALTER TABLE "logitrack"."transport_zone"
    ADD CONSTRAINT "fk_tz_zone"
        FOREIGN KEY ("zone_id") REFERENCES "logitrack"."zone" ("id") ON DELETE CASCADE;

-- Route: ruta planificada/confirmada
CREATE TABLE IF NOT EXISTS "logitrack"."route" (
    "id"                 SERIAL          PRIMARY KEY,
    "transport_id"       INTEGER         NOT NULL,
    "origin_branch_id"   INTEGER         NOT NULL,
    "status_id"          INTEGER         NOT NULL DEFAULT 1,
    "total_distance_km"  DECIMAL(10,2)   NOT NULL DEFAULT 0,
    "total_cost"         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "total_weight_kg"    DECIMAL(10,2)   NOT NULL DEFAULT 0,
    "total_volume_m3"    DECIMAL(10,3)   NOT NULL DEFAULT 0,
    "created_at"         TIMESTAMP       NOT NULL DEFAULT NOW()
);

ALTER TABLE "logitrack"."route"
    DROP CONSTRAINT IF EXISTS "fk_route_transport";
ALTER TABLE "logitrack"."route"
    ADD CONSTRAINT "fk_route_transport"
        FOREIGN KEY ("transport_id") REFERENCES "logitrack"."transport" ("id");

ALTER TABLE "logitrack"."route"
    DROP CONSTRAINT IF EXISTS "fk_route_origin_branch";
ALTER TABLE "logitrack"."route"
    ADD CONSTRAINT "fk_route_origin_branch"
        FOREIGN KEY ("origin_branch_id") REFERENCES "logitrack"."branch" ("id");

-- Route stop: parada (pickup en sucursal | delivery en domicilio)
CREATE TABLE IF NOT EXISTS "logitrack"."route_stop" (
    "id"                     SERIAL         PRIMARY KEY,
    "route_id"               INTEGER        NOT NULL,
    "sequence"               INTEGER        NOT NULL,
    "stop_type"              VARCHAR(20)    NOT NULL,
    "branch_id"              INTEGER        NULL,
    "shipment_id"            INTEGER        NULL,
    "lat"                    DECIMAL(10,7)  NULL,
    "lng"                    DECIMAL(10,7)  NULL,
    "distance_from_prev_km"  DECIMAL(10,2)  NOT NULL DEFAULT 0,
    "completed"              BOOLEAN        NOT NULL DEFAULT false,
    "completed_at"           TIMESTAMP      NULL
);

ALTER TABLE "logitrack"."route_stop"
    DROP CONSTRAINT IF EXISTS "fk_stop_route";
ALTER TABLE "logitrack"."route_stop"
    ADD CONSTRAINT "fk_stop_route"
        FOREIGN KEY ("route_id") REFERENCES "logitrack"."route" ("id") ON DELETE CASCADE;

ALTER TABLE "logitrack"."route_stop"
    DROP CONSTRAINT IF EXISTS "fk_stop_branch";
ALTER TABLE "logitrack"."route_stop"
    ADD CONSTRAINT "fk_stop_branch"
        FOREIGN KEY ("branch_id") REFERENCES "logitrack"."branch" ("id");

ALTER TABLE "logitrack"."route_stop"
    DROP CONSTRAINT IF EXISTS "fk_stop_shipment";
ALTER TABLE "logitrack"."route_stop"
    ADD CONSTRAINT "fk_stop_shipment"
        FOREIGN KEY ("shipment_id") REFERENCES "logitrack"."shipment" ("id");

-- Shipment: nuevas columnas
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "volumeM3" DECIMAL(8,3);

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "zoneId" INTEGER;

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "currentBranchId" INTEGER;

ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "expectedDeliveryDate" DATE;

ALTER TABLE "logitrack"."shipment"
    DROP CONSTRAINT IF EXISTS "fk_shipment_zone";
ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_zone"
        FOREIGN KEY ("zoneId") REFERENCES "logitrack"."zone" ("id");

ALTER TABLE "logitrack"."shipment"
    DROP CONSTRAINT IF EXISTS "fk_shipment_current_branch";
ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_current_branch"
        FOREIGN KEY ("currentBranchId") REFERENCES "logitrack"."branch" ("id");

-- Seed inicial de zonas: barrios CABA mas comunes + 1 por provincia
-- CABA = province_id 2 (segun seed existente; ajustar si difiere)
INSERT INTO "logitrack"."zone" ("name", "province_id", "base_cost", "postal_code_prefixes") VALUES
    ('CABA - Palermo',     24, 500,  '["1425","1426","1414"]'::jsonb),
    ('CABA - Belgrano',    24, 500,  '["1426","1428","1429"]'::jsonb),
    ('CABA - Caballito',   24, 450,  '["1405","1406","1424"]'::jsonb),
    ('CABA - Recoleta',    24, 550,  '["1425","1117","1119"]'::jsonb),
    ('CABA - Microcentro', 24, 600,  '["1001","1002","1003","1004","1005","1006","1007","1008"]'::jsonb),
    ('CABA - Otros',       24, 500,  NULL)
ON CONFLICT DO NOTHING;
