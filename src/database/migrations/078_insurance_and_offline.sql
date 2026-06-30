-- [prototype] Seguro de mercadería + soporte offline del repartidor.
-- Idempotente: estas migraciones corren en cada arranque (sin tabla de tracking).

-- ── A) Seguro de mercadería ──────────────────────────────────────────────
-- valor declarado e importe de seguro "congelado" al momento del alta del envío.
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "declaredValue"   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS "insuranceAmount" NUMERIC(12,2);

-- El total (costTotal) ya incluye el seguro; estas columnas lo itemizan en la nota de
-- crédito y en la factura del envío (ambas comparten el desglose de shipmentCostService).
ALTER TABLE "logitrack"."credit_note"
    ADD COLUMN IF NOT EXISTS "insuranceAmount" NUMERIC(12,2);

ALTER TABLE "logitrack"."invoice"
    ADD COLUMN IF NOT EXISTS "insuranceAmount" NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Porcentaje global de seguro, parametrizable desde Ajustes. 0 = sin seguro.
INSERT INTO "logitrack"."setting" ("key", "value")
VALUES ('seguro_pct', '0')
ON CONFLICT ("key") DO NOTHING;

-- ── B) Offline del repartidor ────────────────────────────────────────────
-- Log de acciones encoladas sin conexión. Sirve para idempotencia (no aplicar
-- dos veces la misma acción al re-sincronizar) y para auditar conflictos.
CREATE TABLE IF NOT EXISTS "logitrack"."offline_action" (
    "id"             SERIAL PRIMARY KEY,
    "idempotencyKey" VARCHAR(80)  NOT NULL UNIQUE,
    "userId"         INTEGER REFERENCES "logitrack"."user"("id"),
    "routeId"        INTEGER,
    "method"         VARCHAR(8)   NOT NULL,
    "path"           VARCHAR(255) NOT NULL,
    "statusCode"     INTEGER,
    "responseBody"   TEXT,
    "conflict"       BOOLEAN NOT NULL DEFAULT false,
    "queuedAt"       TIMESTAMPTZ,
    "syncedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_offline_action_user" ON "logitrack"."offline_action" ("userId");
