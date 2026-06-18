-- Devolución como incidencia (tipo RETURN): motivo de devolución como dato
-- estructurado de la incidencia (filtrable en reportes).
ALTER TABLE "logitrack"."incident"
    ADD COLUMN IF NOT EXISTS "return_reason" VARCHAR(30);
