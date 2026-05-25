-- Sprint 3 - Seeds para los 8 eventos de notificación nuevos.
-- Se ejecuta DESPUÉS de 018 (que agrega valores al ENUM type_notification_event).
-- notification_events.id y email_template.id son INT NOT NULL (sin SERIAL) en schema,
-- por eso usamos ids manuales (10-17) y guardamos contra colisión con MAX(id)+offset.

-- 1) notification_events (catálogo)
INSERT INTO "logitrack"."notification_events" ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"),0) FROM "logitrack"."notification_events") + row_n,
    v::"logitrack"."type_notification_event",
    d
FROM (
    SELECT row_number() OVER () AS row_n, t.v, t.d
    FROM (VALUES
        ('SHIPMENT_OUT_FOR_DELIVERY',    'Salida a reparto'),
        ('SHIPMENT_NEXT_DELIVERY',       'Próxima entrega (ETA cercana)'),
        ('SHIPMENT_ARRIVED_DESTINATION', 'Llegada al domicilio'),
        ('SHIPMENT_RETURNED_BRANCH',     'Devuelto a sucursal'),
        ('SHIPMENT_RESCHEDULED',         'Reprogramación'),
        ('SHIPMENT_INCIDENT',            'Incidencia / demora'),
        ('ROUTE_CANCELLED',              'Ruta cancelada'),
        ('ROUTE_INTERRUPTED',            'Ruta interrumpida')
    ) AS t(v, d)
    WHERE NOT EXISTS (
        SELECT 1 FROM "logitrack"."notification_events" ne WHERE ne."code"::text = t.v
    )
) sub;

-- 2a) Avanzar sequence de notification_config a MAX(id) — el seed inicial usó ids
-- manuales sin actualizar la sequence, por eso nextval() devuelve 1 y colisiona.
SELECT setval(
    pg_get_serial_sequence('"logitrack"."notification_config"', 'id'),
    GREATEST((SELECT COALESCE(MAX("id"),0) FROM "logitrack"."notification_config"), 1)
);

-- 2) notification_config (id es SERIAL → no lo pasamos)
INSERT INTO "logitrack"."notification_config" ("eventCode", "enabled", "recipient_mode")
SELECT v::"logitrack"."type_notification_event", true, 'recipient'
FROM (VALUES
    ('SHIPMENT_OUT_FOR_DELIVERY'),
    ('SHIPMENT_NEXT_DELIVERY'),
    ('SHIPMENT_ARRIVED_DESTINATION'),
    ('SHIPMENT_RETURNED_BRANCH'),
    ('SHIPMENT_RESCHEDULED'),
    ('SHIPMENT_INCIDENT'),
    ('ROUTE_CANCELLED'),
    ('ROUTE_INTERRUPTED')
) AS t(v)
WHERE NOT EXISTS (
    SELECT 1 FROM "logitrack"."notification_config" nc WHERE nc."eventCode"::text = t.v
);

-- 3) email_template (id INT NOT NULL sin SERIAL → ids manuales)
INSERT INTO "logitrack"."email_template" ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"),0) FROM "logitrack"."email_template") + row_n,
    v::"logitrack"."type_notification_event",
    s,
    b
FROM (
    SELECT row_number() OVER () AS row_n, t.v, t.s, t.b
    FROM (VALUES
        ('SHIPMENT_OUT_FOR_DELIVERY',    'Tu envío salió a reparto',          'Hola {{fullName}}, tu envío {{trackingCode}} salió a reparto y llegará hoy.{{secretCodeLine}}'),
        ('SHIPMENT_NEXT_DELIVERY',       'Tu envío está cerca',               'Hola {{fullName}}, tu envío {{trackingCode}} es la próxima entrega del repartidor.'),
        ('SHIPMENT_ARRIVED_DESTINATION', 'El repartidor llegó',               'Hola {{fullName}}, el repartidor llegó al domicilio con tu envío {{trackingCode}}.'),
        ('SHIPMENT_RETURNED_BRANCH',     'Tu envío volvió a sucursal',        'Hola {{fullName}}, tu envío {{trackingCode}} regresó a sucursal. Te avisaremos del próximo intento.'),
        ('SHIPMENT_RESCHEDULED',         'Tu envío fue reprogramado',         'Hola {{fullName}}, tu envío {{trackingCode}} fue reprogramado para un nuevo intento.'),
        ('SHIPMENT_INCIDENT',            'Incidencia en tu envío',            'Hola {{fullName}}, registramos una incidencia en tu envío {{trackingCode}}. Estamos trabajando para resolverla.'),
        ('ROUTE_CANCELLED',              'Ruta cancelada',                    'Hola {{fullName}}, la ruta de tu envío {{trackingCode}} fue cancelada. Será reasignado en el próximo planning.'),
        ('ROUTE_INTERRUPTED',            'Ruta interrumpida',                 'Hola {{fullName}}, la ruta de tu envío {{trackingCode}} fue interrumpida. Volverá a sucursal y se reasignará.')
    ) AS t(v, s, b)
    WHERE NOT EXISTS (
        SELECT 1 FROM "logitrack"."email_template" et WHERE et."eventCode"::text = t.v
    )
) sub;
