-- LGT-214: nota de crédito por reembolso. La dispara tanto el paquete roto (incidencia)
-- como una devolución genérica aprobada con resultado reembolso.
CREATE TABLE IF NOT EXISTS "logitrack"."credit_note" (
    "id"              SERIAL PRIMARY KEY,
    "number"          VARCHAR(30) NOT NULL UNIQUE,
    "shipmentId"      INTEGER NOT NULL REFERENCES "logitrack"."shipment"("id"),
    "incidentId"      INTEGER REFERENCES "logitrack"."incident"("id"),
    -- returnId NO lleva FK: la tabla shipment_return se crea en LGT-182 (otra rama). Se valida en app.
    "returnId"        INTEGER,
    "amount"          NUMERIC(12,2) NOT NULL DEFAULT 0,
    "createdByUserId" INTEGER REFERENCES "logitrack"."user"("id"),
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_credit_note_shipment" ON "logitrack"."credit_note" ("shipmentId");
-- Una sola nota por resolución (incidencia o devolución): unicidad parcial.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_credit_note_incident" ON "logitrack"."credit_note" ("incidentId") WHERE "incidentId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_credit_note_return"   ON "logitrack"."credit_note" ("returnId")   WHERE "returnId"   IS NOT NULL;
