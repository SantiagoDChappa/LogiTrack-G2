-- LGT-215: envío de reposición por reemplazo. Enlaza el nuevo envío con el original
-- para mostrar la relación y para trazabilidad (uno de reposición por envío original).
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "replacement_of_shipment_id" INTEGER REFERENCES "logitrack"."shipment"("id");

CREATE INDEX IF NOT EXISTS "idx_shipment_replacement_of"
    ON "logitrack"."shipment" ("replacement_of_shipment_id");
