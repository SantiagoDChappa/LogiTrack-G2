-- Ojo de Patrón (LGT-197) — detección y revisión del patrón de fatiga recurrente.
-- Agrega al contador agregado los datos de la detección (fecha, eventos, ventana)
-- y el estado de revisión por el Supervisor (revisado / descartado).

ALTER TABLE "logitrack"."fatigue_pattern_counter"
    ADD COLUMN IF NOT EXISTS "recurrent_marked_at"   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "recurrent_events"      INTEGER,
    ADD COLUMN IF NOT EXISTS "recurrent_window_days" INTEGER,
    ADD COLUMN IF NOT EXISTS "recurrent_notified_at" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "review_status"         VARCHAR(12) NOT NULL DEFAULT 'NONE', -- NONE | PENDING | REVIEWED | DISCARDED
    ADD COLUMN IF NOT EXISTS "reviewed_by"           INTEGER,
    ADD COLUMN IF NOT EXISTS "reviewed_at"           TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "review_note"           TEXT;
