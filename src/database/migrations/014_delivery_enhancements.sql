-- Migration 014 - LGT-137: Mejoras de flujo del repartidor
-- Idempotente.

-- ============================================================
-- 1) Shipment: COD, instrucciones, flags de paquete, duración estimada
-- ============================================================
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "cod_amount"           DECIMAL(12,2)  NULL,
    ADD COLUMN IF NOT EXISTS "cod_method"           VARCHAR(20)    NULL,
    ADD COLUMN IF NOT EXISTS "special_instructions" TEXT           NULL,
    ADD COLUMN IF NOT EXISTS "fragile"              BOOLEAN        NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "refrigerated"         BOOLEAN        NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "oversized"            BOOLEAN        NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "estimated_minutes"    INTEGER        NOT NULL DEFAULT 5;

-- ============================================================
-- 2) Route_stop: skipping, ETA por parada, duración estimada
-- ============================================================
ALTER TABLE "logitrack"."route_stop"
    ADD COLUMN IF NOT EXISTS "skipped"            BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "skip_reason"        VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS "skipped_at"         TIMESTAMP    NULL,
    ADD COLUMN IF NOT EXISTS "arrived_at"         TIMESTAMP    NULL,
    ADD COLUMN IF NOT EXISTS "eta_at"             TIMESTAMP    NULL,
    ADD COLUMN IF NOT EXISTS "estimated_minutes"  INTEGER      NOT NULL DEFAULT 5;

-- ============================================================
-- 3) Route: tiempos, pausas, combustible
-- ============================================================
ALTER TABLE "logitrack"."route"
    ADD COLUMN IF NOT EXISTS "started_at"          TIMESTAMP     NULL,
    ADD COLUMN IF NOT EXISTS "finished_at"         TIMESTAMP     NULL,
    ADD COLUMN IF NOT EXISTS "total_pause_seconds" INTEGER       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "fuel_l_per_100km"    DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS "fuel_price_per_l"    DECIMAL(10,2) NOT NULL DEFAULT 1200.00;

-- ============================================================
-- 4) Transport: combustible y comisión por entrega
-- ============================================================
ALTER TABLE "logitrack"."transport"
    ADD COLUMN IF NOT EXISTS "commission_per_delivery" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "fuel_l_per_100km"        DECIMAL(5,2)  NOT NULL DEFAULT 10.00;

-- ============================================================
-- 5) failedAttempt: motivo codificado, vecino, retry same-day
-- ============================================================
ALTER TABLE "logitrack"."failedAttempt"
    ADD COLUMN IF NOT EXISTS "reason_code"       VARCHAR(40)  NULL,
    ADD COLUMN IF NOT EXISTS "neighbor_name"     VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS "neighbor_phone"    VARCHAR(40)  NULL,
    ADD COLUMN IF NOT EXISTS "neighbor_relation" VARCHAR(80)  NULL,
    ADD COLUMN IF NOT EXISTS "retry_same_day"    BOOLEAN      NOT NULL DEFAULT false;

-- ============================================================
-- 6) Pausas de ruta
-- ============================================================
CREATE TABLE IF NOT EXISTS "logitrack"."route_pause" (
    "id"         SERIAL PRIMARY KEY,
    "route_id"   INTEGER     NOT NULL,
    "user_id"    INTEGER     NOT NULL,
    "reason"     VARCHAR(80) NOT NULL,
    "started_at" TIMESTAMP   NOT NULL DEFAULT NOW(),
    "ended_at"   TIMESTAMP   NULL,
    CONSTRAINT "fk_rp_route" FOREIGN KEY ("route_id") REFERENCES "logitrack"."route"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_rp_user"  FOREIGN KEY ("user_id")  REFERENCES "logitrack"."user"("id")
);
CREATE INDEX IF NOT EXISTS "idx_route_pause_route" ON "logitrack"."route_pause" ("route_id");

-- ============================================================
-- 7) Incidentes de ruta (vehicular, accidente, etc)
-- ============================================================
CREATE TABLE IF NOT EXISTS "logitrack"."route_incident" (
    "id"           SERIAL PRIMARY KEY,
    "route_id"     INTEGER       NOT NULL,
    "user_id"      INTEGER       NOT NULL,
    "incident_type" VARCHAR(40)  NOT NULL,
    "severity"     VARCHAR(20)   NOT NULL DEFAULT 'media',
    "description"  TEXT          NULL,
    "latitude"     DECIMAL(10,7) NULL,
    "longitude"    DECIMAL(10,7) NULL,
    "reported_at"  TIMESTAMP     NOT NULL DEFAULT NOW(),
    "resolved_at"  TIMESTAMP     NULL,
    CONSTRAINT "fk_ri_route" FOREIGN KEY ("route_id") REFERENCES "logitrack"."route"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_ri_user"  FOREIGN KEY ("user_id")  REFERENCES "logitrack"."user"("id")
);
CREATE INDEX IF NOT EXISTS "idx_route_incident_route" ON "logitrack"."route_incident" ("route_id");

-- ============================================================
-- 8) Eventos de pánico
-- ============================================================
CREATE TABLE IF NOT EXISTS "logitrack"."panic_event" (
    "id"          SERIAL PRIMARY KEY,
    "user_id"     INTEGER       NOT NULL,
    "route_id"    INTEGER       NULL,
    "latitude"    DECIMAL(10,7) NULL,
    "longitude"   DECIMAL(10,7) NULL,
    "message"     TEXT          NULL,
    "created_at"  TIMESTAMP     NOT NULL DEFAULT NOW(),
    "resolved_at" TIMESTAMP     NULL,
    "resolved_by" INTEGER       NULL,
    CONSTRAINT "fk_pe_user"  FOREIGN KEY ("user_id")  REFERENCES "logitrack"."user"("id"),
    CONSTRAINT "fk_pe_route" FOREIGN KEY ("route_id") REFERENCES "logitrack"."route"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_panic_event_user" ON "logitrack"."panic_event" ("user_id", "created_at" DESC);

-- ============================================================
-- 9) Devolución a sucursal con escaneo
-- ============================================================
CREATE TABLE IF NOT EXISTS "logitrack"."return_to_branch_scan" (
    "id"           SERIAL PRIMARY KEY,
    "shipment_id"  INTEGER   NOT NULL,
    "branch_id"    INTEGER   NOT NULL,
    "user_id"      INTEGER   NOT NULL,
    "route_id"     INTEGER   NULL,
    "scanned_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_rb_ship"   FOREIGN KEY ("shipment_id") REFERENCES "logitrack"."shipment"("id"),
    CONSTRAINT "fk_rb_branch" FOREIGN KEY ("branch_id")   REFERENCES "logitrack"."branch"("id"),
    CONSTRAINT "fk_rb_user"   FOREIGN KEY ("user_id")     REFERENCES "logitrack"."user"("id"),
    CONSTRAINT "fk_rb_route"  FOREIGN KEY ("route_id")    REFERENCES "logitrack"."route"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_return_scan_unique" ON "logitrack"."return_to_branch_scan" ("shipment_id", "route_id");
