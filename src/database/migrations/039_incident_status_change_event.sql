-- Aviso al cliente ante cada cambio de estado de una incidencia (INCIDENT_STATUS_CHANGE).
-- Solo extiende el enum; los INSERT van en 040 (PostgreSQL no permite usar el nuevo
-- valor de enum en la misma transacción que el ALTER TYPE).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'INCIDENT_STATUS_CHANGE';
