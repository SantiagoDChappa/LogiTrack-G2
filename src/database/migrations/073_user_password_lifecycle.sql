-- #1 Primer ingreso — ciclo de vida de la contraseña.
-- El usuario creado por un admin recibe una contraseña temporal autogenerada y debe
-- cambiarla en su primer login (must_change_password). password_changed_at registra
-- el último cambio efectivo del propio usuario.
-- Idempotente: ADD COLUMN IF NOT EXISTS para entornos ya migrados.
ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "password_changed_at"  TIMESTAMP NULL;
