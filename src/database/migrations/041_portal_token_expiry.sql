-- Agrega fecha de vencimiento al token de autogestión del portal (LGT-158).
-- El token expira 72 hs después de generarse, independientemente de si fue usado.
ALTER TABLE logitrack.shipment
    ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ;
