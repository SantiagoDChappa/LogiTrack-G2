-- 3 variantes de SHIPMENT_PACKAGE_FAILED por motivo: NO ENTREGADO / DEMORA / INTENTO FALLIDO.
-- Solo extiende el enum; los seeds van en 049 (PostgreSQL no permite usar el nuevo valor
-- de enum en la misma transacción que el ALTER TYPE).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_PACKAGE_FAILED_UNDELIVERED';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_PACKAGE_FAILED_DELAY';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_PACKAGE_FAILED_ATTEMPT';
