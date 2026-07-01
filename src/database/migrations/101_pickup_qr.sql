-- Retiro en sucursal con QR + código — estado, columnas y plantilla de aviso.
-- Idempotente: corre en cada deploy.

-- ── Estado "Listo para Retiro" (id 12) ──────────────────────────────────────────
INSERT INTO "logitrack"."status" ("id", "description") VALUES
    (12, 'Listo para Retiro')
ON CONFLICT ("id") DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'status_id_seq') THEN
        PERFORM setval('logitrack.status_id_seq', GREATEST((SELECT MAX(id) FROM logitrack.status), 1));
    END IF;
END$$;

-- ── Columnas del retiro en el envío ─────────────────────────────────────────────
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "pickup_code"                VARCHAR(12) NULL;
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "pickup_token"               VARCHAR(64) NULL;
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "pickup_ready_at"            TIMESTAMP   NULL;
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "pickup_expires_at"          TIMESTAMP   NULL;
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "pickup_confirmed_by_user_id" INTEGER    NULL;

-- El token va por URL del QR: índice para resolverlo rápido en el escaneo del operador.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shipment_pickup_token" ON logitrack.shipment ("pickup_token")
    WHERE "pickup_token" IS NOT NULL;

-- ── Evento de notificación nuevo ────────────────────────────────────────────────
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'SHIPMENT_READY_FOR_PICKUP'::"logitrack"."type_notification_event",
    'Envío listo para retirar en sucursal (con código de retiro)'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_READY_FOR_PICKUP'
);

-- ── Config (toggle on/off; default ON, destinatario = destinatario) ─────────────
INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'SHIPMENT_READY_FOR_PICKUP'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_READY_FOR_PICKUP');

-- ── Plantilla editable (Ajustes → Comunicaciones) ───────────────────────────────
-- Placeholders: {{fullName}} {{trackingCode}} {{pickupCode}} {{pickupBranchName}}
--               {{pickupBranchAddress}} {{pickupExpires}} {{trackingStatusUrl}}
INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body", "format")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'SHIPMENT_READY_FOR_PICKUP'::"logitrack"."type_notification_event",
    'Tu envío {{trackingCode}} ya está para retirar',
    'Hola {{fullName}}, tu envío {{trackingCode}} ya llegó al punto de retiro y está listo para que lo busques.

Sucursal: {{pickupBranchName}} — {{pickupBranchAddress}}

Mostrá este código en la sucursal para retirarlo:

    {{pickupCode}}

Tenés tiempo de retirarlo hasta el {{pickupExpires}}.

Para ver el código QR y el estado de tu envío, entrá a:
{{trackingStatusUrl}}

Saludos,
LogiTrack',
    'text'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_READY_FOR_PICKUP'
);
