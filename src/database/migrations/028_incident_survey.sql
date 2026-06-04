-- 028_incident_survey.sql — Portal: encuesta de satisfacción post-incidencia
-- Idempotente.

CREATE TABLE IF NOT EXISTS "logitrack"."incident_survey" (
    "id"                      SERIAL        PRIMARY KEY,
    "incidentId"              INTEGER       NOT NULL,
    "overallRating"           SMALLINT      NOT NULL,
    "resolutionTimeRating"    SMALLINT      NOT NULL,
    "communicationRating"     SMALLINT      NOT NULL,
    "outcomeRating"           SMALLINT      NOT NULL,
    "comment"                 TEXT          NULL,
    "respondedByDocument"     INTEGER       NOT NULL,
    "respondedByEmail"        VARCHAR(255)  NOT NULL,
    "createdAt"               TIMESTAMP     NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_survey_incident') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "fk_incident_survey_incident"
            FOREIGN KEY ("incidentId") REFERENCES "logitrack"."incident" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_incident_survey_incident') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "uq_incident_survey_incident"
            UNIQUE ("incidentId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_survey_overall') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "chk_incident_survey_overall"
            CHECK ("overallRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_survey_resolution_time') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "chk_incident_survey_resolution_time"
            CHECK ("resolutionTimeRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_survey_communication') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "chk_incident_survey_communication"
            CHECK ("communicationRating" BETWEEN 1 AND 5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_survey_outcome') THEN
        ALTER TABLE "logitrack"."incident_survey"
            ADD CONSTRAINT "chk_incident_survey_outcome"
            CHECK ("outcomeRating" BETWEEN 1 AND 5);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_survey_incident"
    ON "logitrack"."incident_survey" ("incidentId");
