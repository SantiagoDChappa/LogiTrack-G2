-- NFAL07 (LGT-158) — ciclo de vida del link accionable de autogestión.
-- El token de /portal/self/:token deja de ser permanente: ahora puede vencer
-- (portal_token_expires_at) y consumirse al reprogramar (portal_token_used_at).
-- Ambos NULL = comportamiento legacy (link sin vencimiento, no consumido).

ALTER TABLE logitrack.shipment
    ADD COLUMN IF NOT EXISTS portal_token_used_at    TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ NULL;
