-- Sprint 3: notificaciones — destinatario configurable por evento + test override
-- recipient_mode: a quién enviar (recipient = destinatario del envío, sender = remitente, both, custom)
-- custom_email: usado cuando recipient_mode = 'custom'

ALTER TABLE "logitrack"."notification_config"
    ADD COLUMN IF NOT EXISTS "recipient_mode" VARCHAR(20) NOT NULL DEFAULT 'recipient',
    ADD COLUMN IF NOT EXISTS "custom_email"   VARCHAR(255) NULL;

ALTER TABLE "logitrack"."notification_config"
    DROP CONSTRAINT IF EXISTS "chk_notif_recipient_mode";
ALTER TABLE "logitrack"."notification_config"
    ADD CONSTRAINT "chk_notif_recipient_mode"
    CHECK ("recipient_mode" IN ('recipient','sender','both','custom'));
