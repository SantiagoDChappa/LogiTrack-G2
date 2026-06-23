-- Nuevo valor del enum de eventos de notificación para el mail de pago de factura.
-- Va en su PROPIA migración (transacción separada) porque PostgreSQL no permite usar
-- un valor de enum recién agregado dentro de la misma transacción que lo agrega.
-- El seed de la plantilla va en 087. Idempotente: IF NOT EXISTS.
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'INVOICE_PAYMENT_LINK';
