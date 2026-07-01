-- Nuevos eventos de mail: cancelación por falta de pago y rechazo de comprobante.
-- En PG no se puede usar un valor de enum recién agregado en la misma transacción;
-- los INSERTs van en la migración 105.
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'INVOICE_PAYMENT_CANCELLED';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'INVOICE_COMPROBANTE_REJECTED';
