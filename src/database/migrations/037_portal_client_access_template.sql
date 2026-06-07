-- Seeds para el mail de acceso al portal cliente "Mis Envíos" (PORTAL_CLIENT_ACCESS).
-- Se ejecuta en transacción separada de 036 por la restricción de PostgreSQL con enums.
-- NO se inserta en notification_config: es un mail transaccional, siempre activo,
-- y no se muestra en la grilla de "Notificaciones por evento" (que es para envíos).
-- Placeholders disponibles: {{confirmUrl}} (enlace de confirmación) y {{ttlHoras}} (validez en horas).

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'PORTAL_CLIENT_ACCESS'::"logitrack"."type_notification_event",
    'Acceso al portal de clientes (Mis Envíos)'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'PORTAL_CLIENT_ACCESS'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'PORTAL_CLIENT_ACCESS'::"logitrack"."type_notification_event",
    '[LogiTrack] Confirmá el acceso a tus envíos',
    'Hola,

Recibimos una solicitud para consultar tus envíos en el portal de LogiTrack.

Para continuar, confirmá tu acceso haciendo click en el siguiente enlace (válido por {{ttlHoras}} horas):

{{confirmUrl}}

Si no solicitaste este acceso, ignorá este mensaje.

Saludos,
Equipo LogiTrack'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'PORTAL_CLIENT_ACCESS'
);
