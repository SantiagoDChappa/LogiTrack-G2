-- LGT-204 — Evento de notificación para "paquete roto o dañado".
-- Aviso al remitente (quien pagó el envío) para que elija reembolso o reemplazo.
-- Solo extiende el enum; los seeds van en 055 (PostgreSQL no permite usar el nuevo
-- valor de enum en la misma transacción que el ALTER TYPE).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'SHIPMENT_PACKAGE_DAMAGED';
