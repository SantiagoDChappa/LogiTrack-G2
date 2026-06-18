-- Factura del envío: se genera al dar de alta el envío, con el desglose de costo
-- al cliente (remitente, quien contrata y paga el envío). Una factura por envío.
CREATE TABLE IF NOT EXISTS "logitrack"."invoice" (
    "id"              SERIAL PRIMARY KEY,
    "number"          VARCHAR(30) NOT NULL UNIQUE,
    "shipmentId"      INTEGER NOT NULL REFERENCES "logitrack"."shipment"("id"),
    "amount"          NUMERIC(12,2) NOT NULL DEFAULT 0,
    "costBase"        NUMERIC(12,2) NOT NULL DEFAULT 0,
    "zoneBase"        NUMERIC(12,2) NOT NULL DEFAULT 0,
    "weightSurcharge" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "volumeSurcharge" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "subtotal"        NUMERIC(12,2) NOT NULL DEFAULT 0,
    "senderName"      VARCHAR(120),
    "senderDocument"  VARCHAR(30),
    "createdByUserId" INTEGER REFERENCES "logitrack"."user"("id"),
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una sola factura por envío.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_invoice_shipment" ON "logitrack"."invoice" ("shipmentId");
