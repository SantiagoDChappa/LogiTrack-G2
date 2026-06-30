-- 043_delivery_survey_nullable_respondent.sql
-- Repara drift de esquema en delivery_survey en bases donde la tabla quedó con
-- columnas NOT NULL que el código no completa:
--   * respondedByDocument / respondedByEmail: la encuesta por token puede no tener
--     esos datos del destinatario (antes insertaba NaN/'null').
--   * accessToken / generatedAt / expiresAt / terminalStatusId: columnas heredadas
--     de un diseño previo que NINGÚN código usa hoy; al ser NOT NULL sin default
--     bloqueaban todo INSERT ("null value in column accessToken ...").
-- En bases creadas desde 027 esas columnas no existen → el bloque las saltea.
-- Idempotente (solo actúa sobre columnas existentes que aún son NOT NULL).

DO $$
DECLARE
    col text;
BEGIN
    FOREACH col IN ARRAY ARRAY[
        'respondedByDocument', 'respondedByEmail',
        'accessToken', 'generatedAt', 'expiresAt', 'terminalStatusId'
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
