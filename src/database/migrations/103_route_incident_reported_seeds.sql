-- Seeds para ROUTE_INCIDENT_REPORTED — corre después de 102 (regla enum).
-- Placeholders soportados por el render (routeIncidentNotify.service):
--   {{routeId}} {{incidentType}} {{severity}} {{driverName}} {{branchName}} {{description}}
--   {{panelUrl}}
-- El recipient_mode queda 'recipient' como placeholder (el service resuelve supervisores
-- de la sucursal + admins por su cuenta, igual que fatigue/notify). El toggle sí se respeta.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'ROUTE_INCIDENT_REPORTED'::"logitrack"."type_notification_event",
    'Incidente reportado por el repartidor durante una ruta'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'ROUTE_INCIDENT_REPORTED'
);

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'ROUTE_INCIDENT_REPORTED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'ROUTE_INCIDENT_REPORTED'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body", "format")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'ROUTE_INCIDENT_REPORTED'::"logitrack"."type_notification_event",
    '[LogiTrack] Incidente en ruta #{{routeId}} — {{incidentType}} ({{severity}})',
    'Hola,

Un repartidor reportó un incidente durante su recorrido:

Ruta: #{{routeId}}
Sucursal origen: {{branchName}}
Transportista: {{driverName}}
Tipo: {{incidentType}}
Severidad: {{severity}}

Detalle:
{{description}}

Podés ver el listado completo y marcarlo como resuelto en:
{{panelUrl}}

Saludos,
LogiTrack',
    'text'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'ROUTE_INCIDENT_REPORTED'
);
