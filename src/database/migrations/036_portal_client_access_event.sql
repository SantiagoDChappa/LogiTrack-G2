-- Mail transaccional del portal cliente "Mis Envíos": confirmación de acceso.
-- Hace editable la plantilla desde Ajustes → Comunicaciones (evento PORTAL_CLIENT_ACCESS).
-- Solo extiende el enum; los INSERT van en 037 (no pueden ir en la misma
-- transacción que el ALTER TYPE, restricción de PostgreSQL).

ALTER TYPE logitrack.type_notification_event ADD VALUE IF NOT EXISTS 'PORTAL_CLIENT_ACCESS';
