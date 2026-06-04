-- Agrega soporte para notificación de demora significativa (LGT-160).
-- Solo extiende el enum y agrega la columna de deduplicación.
-- Los inserts van en 029 (no pueden usarse en la misma transacción que el ALTER TYPE).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_DELAYED';

ALTER TABLE logitrack.shipment
    ADD COLUMN IF NOT EXISTS "delayNotifiedAt" TIMESTAMPTZ DEFAULT NULL;
