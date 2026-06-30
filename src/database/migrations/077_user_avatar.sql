-- Perfil — foto de perfil del usuario (imagen como data URL base64, igual que el resto
-- de las imágenes del sistema). Achicada del lado del cliente antes de guardar.
ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "avatar" TEXT NULL;
