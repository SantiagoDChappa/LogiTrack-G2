-- Seeds para las 3 variantes de SHIPMENT_PACKAGE_FAILED por motivo.
-- Cada una crea: notification_events + notification_config + email_template, todo idempotente.

-- =========================================================================
-- 1) NO ENTREGADO (el envío no se pudo entregar tras agotar reintentos)
-- =========================================================================
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.notification_events) + 1,
       'SHIPMENT_PACKAGE_FAILED_UNDELIVERED'::"logitrack"."type_notification_event",
       'Paquete fallido — No entregado'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_PACKAGE_FAILED_UNDELIVERED');

INSERT INTO logitrack.notification_config ("eventCode","enabled","recipient_mode")
SELECT 'SHIPMENT_PACKAGE_FAILED_UNDELIVERED'::"logitrack"."type_notification_event", true, 'both'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_UNDELIVERED');

INSERT INTO logitrack.email_template ("id","eventCode","subject","body")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.email_template) + 1,
       'SHIPMENT_PACKAGE_FAILED_UNDELIVERED'::"logitrack"."type_notification_event",
       'No pudimos entregar tu envío {{trackingCode}}',
       'Hola {{fullName}},

Tu envío {{trackingCode}} no pudo entregarse tras varios intentos. Generamos la incidencia #{{incidentId}} para gestionar la situación.

Podés coordinar reintento o retiro en sucursal desde el portal:
{{selfServiceUrl}}

Si tenés alguna consulta, podés responder este correo.

Saludos,
{{senderName}}'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_UNDELIVERED');

-- =========================================================================
-- 2) DEMORA (el envío excedió el plazo y se marca como fallido por tiempo)
-- =========================================================================
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.notification_events) + 1,
       'SHIPMENT_PACKAGE_FAILED_DELAY'::"logitrack"."type_notification_event",
       'Paquete fallido — Por demora'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_PACKAGE_FAILED_DELAY');

INSERT INTO logitrack.notification_config ("eventCode","enabled","recipient_mode")
SELECT 'SHIPMENT_PACKAGE_FAILED_DELAY'::"logitrack"."type_notification_event", true, 'both'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_DELAY');

INSERT INTO logitrack.email_template ("id","eventCode","subject","body")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.email_template) + 1,
       'SHIPMENT_PACKAGE_FAILED_DELAY'::"logitrack"."type_notification_event",
       'Tu envío {{trackingCode}} se marcó como fallido por demora',
       'Hola {{fullName}},

Lamentamos informarte que tu envío {{trackingCode}} excedió los plazos máximos de entrega y debió marcarse como fallido. Acumula {{daysDelayed}} día/s de demora.

Generamos la incidencia #{{incidentId}} para acompañar la resolución (reembolso o reenvío según corresponda).

Más información y gestión desde el portal:
{{incidentUrl}}

Saludos,
{{senderName}}'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_DELAY');

-- =========================================================================
-- 3) INTENTO FALLIDO (no se pudo entregar en una visita puntual: ausente, dirección, etc.)
-- =========================================================================
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.notification_events) + 1,
       'SHIPMENT_PACKAGE_FAILED_ATTEMPT'::"logitrack"."type_notification_event",
       'Paquete fallido — Por intento fallido'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_PACKAGE_FAILED_ATTEMPT');

INSERT INTO logitrack.notification_config ("eventCode","enabled","recipient_mode")
SELECT 'SHIPMENT_PACKAGE_FAILED_ATTEMPT'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_ATTEMPT');

INSERT INTO logitrack.email_template ("id","eventCode","subject","body")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.email_template) + 1,
       'SHIPMENT_PACKAGE_FAILED_ATTEMPT'::"logitrack"."type_notification_event",
       'No pudimos entregar tu envío {{trackingCode}} — Motivo: {{failedReason}}',
       'Hola {{fullName}},

Pasamos a entregar tu envío {{trackingCode}} pero no pudimos completar la entrega.

Motivo: {{failedReason}}

Podés reprogramar la entrega o elegir retiro en sucursal desde el portal:
{{selfServiceUrl}}

Saludos,
{{senderName}}'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED_ATTEMPT');
