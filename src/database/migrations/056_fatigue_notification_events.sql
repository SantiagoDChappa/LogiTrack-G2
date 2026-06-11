-- Avisos de fatiga al Supervisor de la sucursal del transportista (+ admins), todos
-- editables desde Ajustes → Comunicaciones. Solo extiende el enum; los INSERT van en 057
-- (ALTER TYPE ADD VALUE no puede usar el valor en la misma transacción — restricción PG).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_ROUTE_BLOCKED';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_REVIEW_NO_BLOCK';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_RECHECK_OMITTED';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_CONSENT_REJECTED';
ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'FATIGUE_PATTERN_RECURRENT';
