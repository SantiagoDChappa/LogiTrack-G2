-- Retiro en sucursal con QR — valor de enum del evento de notificación.
-- Va en su PROPIA migración (separada de la que lo usa) porque Postgres no permite usar un
-- valor de enum recién agregado en la misma transacción/sentencia que el ALTER TYPE. Al
-- correr como archivo aparte, el valor queda commiteado antes de que 101 lo referencie.
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_READY_FOR_PICKUP';
