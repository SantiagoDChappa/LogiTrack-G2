-- 038_delivery_survey_lifecycle.sql
-- Evoluciona delivery_survey para soportar:
-- - generación al llegar a estado terminal elegible
-- - token público único por encuesta
-- - vencimiento configurable
-- - respuesta posterior (una sola vez)
-- - NPS 0..10
-- Idempotente.

ALTER TABLE "logitrack"."delivery_survey"
    ADD COLUMN IF NOT EXISTS "accessToken"      VARCHAR(80) NULL,
    ADD COLUMN IF NOT EXISTS "generatedAt"      TIMESTAMP   NULL,
    ADD COLUMN IF NOT EXISTS "expiresAt"        TIMESTAMP   NULL,
    ADD COLUMN IF NOT EXISTS "answeredAt"       TIMESTAMP   NULL,
    ADD COLUMN IF NOT EXISTS "emailSentAt"      TIMESTAMP   NULL,
    ADD COLUMN IF NOT EXISTS "terminalStatusId" INTEGER     NULL,
    ADD COLUMN IF NOT EXISTS "npsScore"         SMALLINT    NULL;

ALTER TABLE "logitrack"."delivery_survey"
    ALTER COLUMN "overallRating" DROP NOT NULL,
    ALTER COLUMN "punctualityRating" DROP NOT NULL,
    ALTER COLUMN "packageConditionRating" DROP NOT NULL,
    ALTER COLUMN "serviceRating" DROP NOT NULL,
    ALTER COLUMN "respondedByDocument" DROP NOT NULL,
    ALTER COLUMN "respondedByEmail" DROP NOT NULL;

-- Backfill mínimo para registros históricos ya respondidos.
UPDATE "logitrack"."delivery_survey" ds
   SET "generatedAt" = COALESCE(ds."generatedAt", ds."createdAt"),
       "answeredAt"  = COALESCE(ds."answeredAt", CASE WHEN ds."overallRating" IS NOT NULL THEN ds."createdAt" ELSE NULL END);

UPDATE "logitrack"."delivery_survey" ds
   SET "terminalStatusId" = COALESCE(ds."terminalStatusId", s."statusId")
  FROM "logitrack"."shipment" s
 WHERE s."id" = ds."shipmentId";

UPDATE "logitrack"."delivery_survey"
   SET "expiresAt" = COALESCE("expiresAt", "generatedAt" + INTERVAL '30 days')
 WHERE "generatedAt" IS NOT NULL;

UPDATE "logitrack"."delivery_survey"
   SET "accessToken" = COALESCE("accessToken", CONCAT('legacy-', "id", '-', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text))
 WHERE "id" IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_nps') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_nps"
            CHECK ("npsScore" IS NULL OR "npsScore" BETWEEN 0 AND 10);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_terminal_status') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_terminal_status"
            CHECK ("terminalStatusId" IN (4, 5));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_delivery_survey_access_token') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "uq_delivery_survey_access_token"
            UNIQUE ("accessToken");
    END IF;
END$$;

ALTER TABLE "logitrack"."delivery_survey"
    ALTER COLUMN "accessToken" SET NOT NULL,
    ALTER COLUMN "generatedAt" SET NOT NULL,
    ALTER COLUMN "expiresAt" SET NOT NULL,
    ALTER COLUMN "terminalStatusId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_delivery_survey_access_token"
    ON "logitrack"."delivery_survey" ("accessToken");

CREATE INDEX IF NOT EXISTS "idx_delivery_survey_expires_at"
    ON "logitrack"."delivery_survey" ("expiresAt");

CREATE INDEX IF NOT EXISTS "idx_delivery_survey_answered_at"
    ON "logitrack"."delivery_survey" ("answeredAt");
