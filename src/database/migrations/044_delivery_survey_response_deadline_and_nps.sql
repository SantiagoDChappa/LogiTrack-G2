-- 044_delivery_survey_response_deadline_and_nps.sql
-- Agrega soporte para NPS, expiración configurable y encuestas pendientes en delivery_survey.
-- Cambia los ratings a NULLABLE para permitir crear registros de encuesta sin respuesta.
-- La columna expiresAt se usa para controlar si una encuesta pendiente ya caducó.

DO $$
DECLARE
    col text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'logitrack' AND table_name = 'delivery_survey'
          AND column_name = 'recommendationScore'
    ) THEN
        EXECUTE 'ALTER TABLE "logitrack"."delivery_survey" ADD COLUMN "recommendationScore" smallint NULL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'logitrack' AND table_name = 'delivery_survey'
          AND column_name = 'respondedAt'
    ) THEN
        EXECUTE 'ALTER TABLE "logitrack"."delivery_survey" ADD COLUMN "respondedAt" timestamp NULL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'logitrack' AND table_name = 'delivery_survey'
          AND column_name = 'expiresAt'
    ) THEN
        EXECUTE 'ALTER TABLE "logitrack"."delivery_survey" ADD COLUMN "expiresAt" timestamp NULL';
    END IF;

    FOREACH col IN ARRAY ARRAY[
        'overallRating',
        'punctualityRating',
        'packageConditionRating',
        'serviceRating'
    ] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'logitrack' AND table_name = 'delivery_survey'
              AND column_name = col AND is_nullable = 'NO'
        ) THEN
            EXECUTE format('ALTER TABLE "logitrack"."delivery_survey" ALTER COLUMN %I DROP NOT NULL', col);
        END IF;
    END LOOP;
END$$;
