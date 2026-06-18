-- #3 Recuperar contraseña — token de reset por email.
-- Se guarda el HASH del token (nunca el token en claro), de un solo uso y con vencimiento.
CREATE TABLE IF NOT EXISTS "logitrack"."password_reset_token" (
    "id"         SERIAL PRIMARY KEY,
    "user_id"    INTEGER NOT NULL REFERENCES "logitrack"."user"("id"),
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP   NOT NULL,
    "used_at"    TIMESTAMP   NULL,
    "created_at" TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_prt_token_hash" ON "logitrack"."password_reset_token" ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_prt_user"       ON "logitrack"."password_reset_token" ("user_id");
