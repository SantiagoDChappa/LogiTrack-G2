-- LGT-204 — Notificación de paquete dañado con opciones de resolución.
-- Guarda la elección del remitente (reembolso / reemplazo) sobre una incidencia
-- de tipo "paquete dañado/roto", visible para el Supervisor que la gestiona.

ALTER TABLE "logitrack"."incident"
    ADD COLUMN IF NOT EXISTS "damage_choice"      VARCHAR(12),  -- REEMBOLSO | REEMPLAZO
    ADD COLUMN IF NOT EXISTS "damage_choice_at"   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "damage_choice_by"   VARCHAR(160); -- email/identidad del remitente que eligió
