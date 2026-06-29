-- Cuando una nota de crédito cubre el total de una factura (siempre es así: el
-- monto de la NC es el costo completo del envío), la factura pasa a "ANULADA" en
-- vez de quedar "PENDIENTE"/"PAGADA" indefinidamente. Guardamos qué NC la anuló.
ALTER TABLE "logitrack"."invoice"
    ADD COLUMN IF NOT EXISTS "voidedByCreditNoteId" INTEGER;
