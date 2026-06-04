-- 027_delivery_survey.sql — Portal HU 6: encuesta de satisfacción post-entrega
-- Idempotente.

CREATE TABLE IF NOT EXISTS "logitrack"."delivery_survey" (
    "id"                      SERIAL        PRIMARY KEY,
    "shipmentId"              INTEGER       NOT NULL,
    "overallRating"           SMALLINT      NOT NULL,
    "punctualityRating"       SMALLINT      NOT NULL,
    "packageConditionRating"  SMALLINT      NOT NULL,
    "serviceRating"           SMALLINT      NOT NULL,
    "comment"                 TEXT          NULL,
    "respondedByDocument"     INTEGER       NOT NULL,
    "respondedByEmail"        VARCHAR(255)  NOT NULL,
    "createdAt"               TIMESTAMP     NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_survey_shipment') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "fk_delivery_survey_shipment"
            FOREIGN KEY ("shipmentId") REFERENCES "logitrack"."shipment" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_delivery_survey_shipment') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "uq_delivery_survey_shipment"
            UNIQUE ("shipmentId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_overall') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_overall"
            CHECK ("overallRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_punctuality') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_punctuality"
            CHECK ("punctualityRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_package') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_package"
            CHECK ("packageConditionRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_survey_service') THEN
        ALTER TABLE "logitrack"."delivery_survey"
            ADD CONSTRAINT "chk_delivery_survey_service"
            CHECK ("serviceRating" BETWEEN 1 AND 5);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_delivery_survey_shipment"
    ON "logitrack"."delivery_survey" ("shipmentId");
