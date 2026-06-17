-- LGT-214 precondición: persiste el costo total del envío al momento de su creación
-- para que la nota de crédito use siempre el precio original, sin depender de settings actuales.
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "costTotal" NUMERIC(12,2);
