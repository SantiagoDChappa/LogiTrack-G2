-- Migration 004
-- Elimina la columna personTypeId de la tabla person ya que el rol depende del envío, no de la persona.

ALTER TABLE "logitrack"."person" DROP CONSTRAINT IF EXISTS "fk_person_personTypeId_personType_id";
ALTER TABLE "logitrack"."person" DROP COLUMN IF EXISTS "personTypeId";
