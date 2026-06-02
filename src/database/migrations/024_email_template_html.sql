-- Migration 024 - Soporte de formato (texto / HTML) en plantillas de email
-- Agrega columna "format" a email_template y notification_email.
-- Idempotente.

ALTER TABLE "logitrack"."email_template"
    ADD COLUMN IF NOT EXISTS "format" VARCHAR(8) NOT NULL DEFAULT 'text';

ALTER TABLE "logitrack"."notification_email"
    ADD COLUMN IF NOT EXISTS "format" VARCHAR(8) NOT NULL DEFAULT 'text';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_email_template_format') THEN
        ALTER TABLE "logitrack"."email_template"
            ADD CONSTRAINT "chk_email_template_format"
            CHECK ("format" IN ('text','html'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notification_email_format') THEN
        ALTER TABLE "logitrack"."notification_email"
            ADD CONSTRAINT "chk_notification_email_format"
            CHECK ("format" IN ('text','html'));
    END IF;
END$$;
