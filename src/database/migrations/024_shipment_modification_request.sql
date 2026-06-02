-- 024_shipment_modification_request.sql — Portal HU 2: gestión de modificaciones
-- Idempotente.

CREATE TABLE IF NOT EXISTS "logitrack"."shipment_modification_request" (
    "id"                   SERIAL       PRIMARY KEY,
    "shipmentId"           INTEGER      NOT NULL,
    "changeType"           VARCHAR(40)  NOT NULL,
    "payload"              JSONB        NOT NULL,
    "status"               VARCHAR(20)  NOT NULL,
    "channel"              VARCHAR(20)  NOT NULL DEFAULT 'PORTAL',
    "requestedByDocument"  INTEGER      NULL,
    "requestedByEmail"     VARCHAR(160) NULL,
    "reviewedByUserId"     INTEGER      NULL,
    "reviewedAt"           TIMESTAMP    NULL,
    "reviewComment"        TEXT         NULL,
    "createdAt"            TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mod_request_shipment') THEN
        ALTER TABLE "logitrack"."shipment_modification_request"
            ADD CONSTRAINT "fk_mod_request_shipment"
            FOREIGN KEY ("shipmentId") REFERENCES "logitrack"."shipment" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mod_request_reviewer') THEN
        ALTER TABLE "logitrack"."shipment_modification_request"
            ADD CONSTRAINT "fk_mod_request_reviewer"
            FOREIGN KEY ("reviewedByUserId") REFERENCES "logitrack"."user" ("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mod_request_status') THEN
        ALTER TABLE "logitrack"."shipment_modification_request"
            ADD CONSTRAINT "chk_mod_request_status"
            CHECK ("status" IN ('PENDING_REVIEW', 'APPLIED', 'REJECTED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mod_request_channel') THEN
        ALTER TABLE "logitrack"."shipment_modification_request"
            ADD CONSTRAINT "chk_mod_request_channel"
            CHECK ("channel" IN ('PORTAL'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_mod_request_shipment"
    ON "logitrack"."shipment_modification_request" ("shipmentId");

CREATE INDEX IF NOT EXISTS "idx_mod_request_status"
    ON "logitrack"."shipment_modification_request" ("status");

CREATE INDEX IF NOT EXISTS "idx_mod_request_pending"
    ON "logitrack"."shipment_modification_request" ("createdAt")
    WHERE "status" = 'PENDING_REVIEW';
