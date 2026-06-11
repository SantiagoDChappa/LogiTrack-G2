-- Comentarios INTERNOS del operador no deben verse en el portal del cliente.
-- Regla (automática por acción): "Solo comentar" del staff => interno; cambios de
-- estado y respuestas del cliente => visibles. El portal filtra internal = true.
ALTER TABLE "logitrack"."incident_history"
    ADD COLUMN IF NOT EXISTS "internal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: comentarios sueltos del staff (COMMENT con userId y sin personId) = internos.
-- Idempotente: el filtro internal = false hace que en re-ejecuciones no toque filas ya marcadas.
UPDATE "logitrack"."incident_history"
    SET "internal" = true
    WHERE "eventType" = 'COMMENT'
      AND "userId" IS NOT NULL
      AND "personId" IS NULL
      AND "internal" = false;
