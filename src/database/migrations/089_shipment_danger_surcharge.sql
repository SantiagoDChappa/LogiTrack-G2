-- Recargo por zona peligrosa "congelado" al alta del envío (como insuranceAmount).
-- El ruteo no recalcula nada: usa el costTotal ya persistido. Evaluar la peligrosidad
-- en cada cálculo de costo (detalle/NC/ruteo) sería frágil; se fija una vez al crear.
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "dangerSurcharge" NUMERIC(12,2);
