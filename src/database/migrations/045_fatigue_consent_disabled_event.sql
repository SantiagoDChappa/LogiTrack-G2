-- LGT-195: notificación a Supervisores cuando el transportista queda inhabilitado por
-- rechazar el consentimiento del control de fatiga (al alcanzar el límite parametrizado).
-- Editable desde Ajustes → Comunicaciones (evento FATIGUE_DRIVER_DISABLED_CONSENT).
-- Solo extiende el enum; los INSERT van en 046 (no pueden ir en la misma transacción
-- que el ALTER TYPE — restricción de PostgreSQL con enums).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_DRIVER_DISABLED_CONSENT';
