-- LGT-182/183/184/186 — Devoluciones (greenfield). "return" es palabra reservada → shipment_return.
CREATE TABLE IF NOT EXISTS "logitrack"."shipment_return" (
    "id"               SERIAL PRIMARY KEY,
    "shipmentId"       INTEGER NOT NULL REFERENCES "logitrack"."shipment"("id"),
    "status"           VARCHAR(20) NOT NULL DEFAULT 'SOLICITADA',
    "reason"           VARCHAR(30) NOT NULL,        -- DEFECTUOSO | INCORRECTO | DANADO | ARREPENTIMIENTO | OTRO
    "reasonOther"      TEXT,                        -- texto libre obligatorio cuando reason = OTRO
    "observations"     TEXT,
    "deliveryMode"     VARCHAR(20) NOT NULL DEFAULT 'home',  -- home (retiro a domicilio) | branch (entrega en sucursal); LGT-184
    "pickupBranchId"   INTEGER REFERENCES "logitrack"."branch"("id"),
    "result"           VARCHAR(20),                 -- REEMBOLSO | REEMPLAZO (lo define el supervisor al aprobar, LGT-183)
    "rejectionReason"  TEXT,
    "reviewedByUserId" INTEGER REFERENCES "logitrack"."user"("id"),
    "createdByDocument" VARCHAR(30),                -- identidad validada del cliente que la creó
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_return_shipment" ON "logitrack"."shipment_return" ("shipmentId");
CREATE INDEX IF NOT EXISTS "idx_return_status"   ON "logitrack"."shipment_return" ("status");

-- Historial cronológico de la devolución (seguimiento, LGT-186; trazabilidad de gestión, LGT-183).
CREATE TABLE IF NOT EXISTS "logitrack"."shipment_return_history" (
    "id"          SERIAL PRIMARY KEY,
    "returnId"    INTEGER NOT NULL REFERENCES "logitrack"."shipment_return"("id") ON DELETE CASCADE,
    "fromStatus"  VARCHAR(20),
    "toStatus"    VARCHAR(20),
    "comment"     TEXT,
    "byUserId"    INTEGER REFERENCES "logitrack"."user"("id"),
    "byClient"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_return_history_return" ON "logitrack"."shipment_return_history" ("returnId", "createdAt");
