-- Seeds para INCIDENT_STATUS_CHANGE (aviso al cliente por cambio de estado de incidencia).
-- Transacción separada de 039 por la restricción de PostgreSQL con enums.
-- Placeholders propios del evento: {{incidentId}} y {{incidentEstado}} (se resuelven al enviar).
-- También sirven los del envío: {{fullName}}, {{trackingCode}}, {{trackingUrl}}, etc.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'INCIDENT_STATUS_CHANGE'::"logitrack"."type_notification_event",
    'Cambio de estado de incidencia'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'INCIDENT_STATUS_CHANGE'
);

-- recipient_mode 'both': el aviso le llega al cliente que reportó (remitente o destinatario). Ver CP-SEGC08.
INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'INCIDENT_STATUS_CHANGE'::"logitrack"."type_notification_event", true, 'both'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'INCIDENT_STATUS_CHANGE'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'INCIDENT_STATUS_CHANGE'::"logitrack"."type_notification_event",
    'Actualización de tu incidencia #{{incidentId}} — {{trackingCode}}',
    'Hola {{fullName}},

La incidencia #{{incidentId}} de tu envío {{trackingCode}} cambió de estado.

Nuevo estado: {{incidentEstado}}

Podés ver el detalle y responder desde el portal:
{{trackingUrl}}

Saludos,
{{senderName}}'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'INCIDENT_STATUS_CHANGE'
);
