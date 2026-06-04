-- Seeds para la notificación SHIPMENT_DELAYED (LGT-160).
-- Se ejecuta en transacción separada de 028 por restricción de PostgreSQL con enums.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'SHIPMENT_DELAYED'::"logitrack"."type_notification_event",
    'Demora significativa en entrega'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_DELAYED'
);

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'SHIPMENT_DELAYED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_DELAYED'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'SHIPMENT_DELAYED'::"logitrack"."type_notification_event",
    'Tu envío {{trackingCode}} presenta una demora',
    'Hola {{fullName}},

Te informamos que tu envío ({{trackingCode}}) presenta una demora de {{daysDelayed}} día(s) respecto a la fecha estimada de entrega.

Estado actual: {{statusLabel}}

Podés consultar el seguimiento de tu envío en el siguiente enlace:
{{trackingUrl}}

Si preferís reprogramar la entrega o elegir retiro en sucursal:
{{selfServiceUrl}}

Lamentamos los inconvenientes. Estamos trabajando para resolver la situación a la brevedad.

Saludos,
{{senderName}}'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_DELAYED'
);
