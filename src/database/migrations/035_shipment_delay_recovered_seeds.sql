-- LGT-160 Esc.6 — seeds de la notificación SHIPMENT_DELAY_RECOVERED.
-- Se ejecuta separado de 034 por la restricción de PostgreSQL con enums.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'SHIPMENT_DELAY_RECOVERED'::"logitrack"."type_notification_event",
    'Recuperación de demora (ETA actualizado)'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_DELAY_RECOVERED'
);

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'SHIPMENT_DELAY_RECOVERED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_DELAY_RECOVERED'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'SHIPMENT_DELAY_RECOVERED'::"logitrack"."type_notification_event",
    'Tu envío {{trackingCode}} ya no presenta demora',
    'Hola {{fullName}},

Buenas noticias: tu envío ({{trackingCode}}) ya no se encuentra en demora significativa.

Estado actual: {{statusLabel}}

Podés consultar el seguimiento en el siguiente enlace:
{{trackingUrl}}

Gracias por tu paciencia.

Saludos,
{{senderName}}'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_DELAY_RECOVERED'
);
