-- #2 2FA (TOTP) — segundo factor por usuario + dispositivos confiables ("recordar 30 días").
-- two_factor_secret se guarda CIFRADO (AES-256-GCM, ver utils/twoFactorCrypto).
-- two_factor_backup_codes: JSON con los HASH de los códigos de respaldo (un solo uso).
ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "two_factor_enabled"      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "two_factor_secret"       TEXT NULL,
    ADD COLUMN IF NOT EXISTS "two_factor_backup_codes" TEXT NULL;

CREATE TABLE IF NOT EXISTS "logitrack"."trusted_device" (
    "id"         SERIAL PRIMARY KEY,
    "user_id"    INTEGER NOT NULL REFERENCES "logitrack"."user"("id"),
    "token_hash" VARCHAR(64)  NOT NULL,
    "expires_at" TIMESTAMP    NOT NULL,
    "user_agent" VARCHAR(255) NULL,
    "created_at" TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_td_lookup" ON "logitrack"."trusted_device" ("user_id", "token_hash");
