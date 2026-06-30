-- Capa visual del mapa de zonas: qué partidos (departamentos INDEC) cubre cada
-- zona. NO afecta el costeo (eso sigue resolviéndose por postal_code_prefixes).
-- Array de códigos INDEC de departamento como JSONB. Idempotente.
ALTER TABLE logitrack.zone
    ADD COLUMN IF NOT EXISTS departamento_ids JSONB;
