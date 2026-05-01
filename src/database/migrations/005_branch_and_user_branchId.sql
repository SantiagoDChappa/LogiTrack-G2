-- Migration 005
-- Crea la tabla branch y agrega la FK branchId en user.
-- Idempotente: seguro de re-ejecutar.

CREATE TABLE IF NOT EXISTS "logitrack"."branch" (
    "id"          SERIAL         PRIMARY KEY,
    "name"        VARCHAR(150)   NOT NULL,
    "province_id" INTEGER        NOT NULL,
    "latitude"    DECIMAL(10,7)  NOT NULL,
    "longitude"   DECIMAL(10,7)  NOT NULL,
    "address"     VARCHAR(255)   NOT NULL,
    "postal_code" VARCHAR(10)    NOT NULL,
    "phone"       VARCHAR(20),
    "status_id"   INTEGER        NOT NULL DEFAULT 1
);

ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

ALTER TABLE "logitrack"."user"
    DROP CONSTRAINT IF EXISTS "fk_user_branchId";

ALTER TABLE "logitrack"."user"
    ADD CONSTRAINT "fk_user_branchId"
        FOREIGN KEY ("branchId") REFERENCES "logitrack"."branch" ("id");
