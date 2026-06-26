-- Bloqueo de cuenta tras intentos fallidos de login (3 intentos -> 30 min de bloqueo).
ALTER TABLE logitrack."user"
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ NULL;
