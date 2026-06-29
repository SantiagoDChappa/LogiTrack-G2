-- Recargo por distancia (origen-destino) + recargos diferenciados por tipo de
-- envío (Express) y manejo especial (Frágil). Se congelan al alta del envío,
-- igual que el seguro y el recargo de zona peligrosa, para que factura/NC/ruteo
-- usen siempre el total ya calculado y no dependan de tarifas que cambien después.
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "distanceKm"        NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS "distanceSurcharge"  NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS "expressSurcharge"   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS "fragileSurcharge"   NUMERIC(12,2);

-- Itemizado en la factura (igual que insuranceAmount), para que el comprobante
-- muestre estos recargos por separado y no quede todo mezclado en el subtotal.
ALTER TABLE "logitrack"."invoice"
    ADD COLUMN IF NOT EXISTS "distanceKm"         NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS "distanceSurcharge"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "expressSurcharge"   NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "fragileSurcharge"   NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Idem en la nota de crédito, para que el reembolso itemizado coincida con la factura.
ALTER TABLE "logitrack"."credit_note"
    ADD COLUMN IF NOT EXISTS "distanceKm"         NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS "distanceSurcharge"  NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "expressSurcharge"   NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "fragileSurcharge"   NUMERIC(12,2) NOT NULL DEFAULT 0;

INSERT INTO logitrack.setting (key, value) VALUES
    ('costo_por_km', '5'),
    ('recargo_express_pct', '15'),
    ('recargo_fragil_pct', '10')
ON CONFLICT (key) DO NOTHING;
