-- ============================================================
-- LogiTrack - Seed Data
-- ============================================================

-- statuses
INSERT INTO "logitrack"."status" ("id", "description") VALUES
    (1, 'Pendiente'),
    (2, 'En Transito'),
    (3, 'En Sucursal'),
    (4, 'Entregado'),
    (5, 'Cancelado'),
    (6, 'Asignado'),
    (7, 'En Preparacion'),
    (8, 'Paquete Fallido'),
    (9, 'Intento Fallido')
ON CONFLICT ("id") DO NOTHING;

-- personTypes
INSERT INTO "logitrack"."personType" ("id", "description") VALUES
    (1, 'Remitente'),
    (2, 'Destinatario');

-- roleTypes
INSERT INTO "logitrack"."roleType" ("id", "description") VALUES
    (1, 'Supervisor'),
    (2, 'Operador'),
    (3, 'Repartidor'),
    (4, 'Administrador');

-- branches
INSERT INTO "logitrack"."branch" ("name", "province_id", "latitude", "longitude", "address", "postal_code") VALUES
    ('Sucursal Buenos Aires', 24, -34.6037,  -58.3816, 'Av. Corrientes 1234', 'C1043'),
    ('Sucursal Córdoba',       5, -31.4201,  -64.1888, 'Bv. San Juan 500',    'X5000'),
    ('Sucursal Rosario',      20, -32.9468,  -60.6393, 'Córdoba 1200',        'S2000')
ON CONFLICT DO NOTHING;

-- users
INSERT INTO "logitrack"."user" ("fullName", "email", "password", "document", "roleId", "branchId") VALUES
    ('Santiago Chappa',         'santiagochappa@logitrack.com.ar',      '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa', 45202349,   1, 1),
    ('Amin',                    'amin@logitrack.com.ar',                '$2b$12$eqMriItP1Z9X7kKZL9iHyurmsTwsYX8OBGSvibhvM6eGfZlgFK/za', 1123233434, 1, 2),
    ('Juan',                    'juan@logitrack.com.ar',                '$2b$12$A4eIs04S45G3LAenyjt8h.Etu57ieZpjHdD.P3WSdmnLWeO4rNxnK',  1109987765, 1, 1),
    ('Juan OP',                 'juanoperador@logitrack.com.ar',        '$2b$12$0FghDPRkMXlET7XfKvRNXOORzwmo0qP7OJ.becrlMtDmUtuP4Uv82', 1198989898, 2, NULL),
    ('Amin OP',                 'aminoperador@logitrack.com.ar',        '$2b$12$Y2tw4Fb5Vu3hB2x6boSVCulGoYLRDAcjhpviVgBNxatfcQnVz72wS', 11099087,   2, NULL),
    ('Maximo Valentin Flores',  'floresmaximovalentin@gmail.com',       '$2b$12$QeMel/akGF9KTkQXqnXtWeP4.TyyNeUJdcW6gChg.5iu7kK7O2JUG', 43503918,   1, 3),
    ('Rubi Rose',               'rubirose@gmail.com',                   '$2b$12$zPvoebtpukk2aNU276GJXOLDtgOk2IBeG6eMhlDnRm.eJnO7PQL92', 1111,       2, NULL),
    ('Carlos Repartidor',       'carlos@logitrack.com.ar',              '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa', 30111222,   3, 1),
    ('Maria Repartidora',       'maria@logitrack.com.ar',               '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa', 30333444,   3, 2),
    ('Pedro Repartidor',        'pedro@logitrack.com.ar',               '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa', 30555666,   3, 3),
    ('Admin',                   'admin@logitrack.com.ar',               '$2b$12$SdXTpizzNqadaUlooEyCXu7n9AybN/4kXHFznyAQwHhC04vpk3sUi', 99999999,   4, NULL);

-- shipmentTypes
INSERT INTO "logitrack"."shipmentType" ("id", "description") VALUES
    (1, 'Express'),
    (2, 'Estándar');

-- provinces
INSERT INTO "logitrack"."province" ("id", "description") VALUES
    (1,  'Buenos Aires'),
    (2,  'Catamarca'),
    (3,  'Chaco'),
    (4,  'Chubut'),
    (5,  'Córdoba'),
    (6,  'Corrientes'),
    (7,  'Entre Ríos'),
    (8,  'Formosa'),
    (9,  'Jujuy'),
    (10, 'La Pampa'),
    (11, 'La Rioja'),
    (12, 'Mendoza'),
    (13, 'Misiones'),
    (14, 'Neuquén'),
    (15, 'Río Negro'),
    (16, 'Salta'),
    (17, 'San Juan'),
    (18, 'San Luis'),
    (19, 'Santa Cruz'),
    (20, 'Santa Fe'),
    (21, 'Santiago del Estero'),
    (22, 'Tierra del Fuego'),
    (23, 'Tucumán'),
    (24, 'Ciudad Autónoma de Buenos Aires');

INSERT INTO "logitrack"."notification_events" ("id", "code", "description") VALUES
    (1, 'SHIPMENT_PENDING', 'notificacion de envio pendiente'),
    (2, 'SHIPMENT_IN_TRANSIT', 'notificacion de envio en tránsito'),
    (3, 'SHIPMENT_IN_BRANCH', 'notificacion de envio en sucursal'),
    (4, 'SHIPMENT_DELIVERED', 'notificacion de envio entregado'),
    (5, 'SHIPMENT_CANCELLED', 'notificacion de envio cancelado'),
    (6, 'SHIPMENT_ASSIGNED', 'notificacion de envio asignado'),
    (7, 'SHIPMENT_IN_PREPARATION', 'notificacion de envio en preparacion'),
    (8, 'SHIPMENT_PACKAGE_FAILED', 'notificacion de paquete fallido'),
    (9, 'SHIPMENT_FAILED_ATTEMPT', 'notificacion de intento de envio fallido');

INSERT INTO "logitrack"."notification_config" ("id", "eventCode", "enabled") VALUES
    (1, 'SHIPMENT_PENDING', true),
    (2, 'SHIPMENT_IN_TRANSIT', true),
    (3, 'SHIPMENT_IN_BRANCH', true),
    (4, 'SHIPMENT_DELIVERED', true),
    (5, 'SHIPMENT_CANCELLED', true),
    (6, 'SHIPMENT_ASSIGNED', true),
    (7, 'SHIPMENT_IN_PREPARATION', true),
    (8, 'SHIPMENT_PACKAGE_FAILED', true),
    (9, 'SHIPMENT_FAILED_ATTEMPT', true);

INSERT INTO "logitrack"."email_template" ("id", "eventCode", "subject", "body") VALUES
    (1, 'SHIPMENT_PENDING', 'Tu envío está pendiente', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} está pendiente.'),
    (2, 'SHIPMENT_IN_TRANSIT', 'Tu envío está en tránsito', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} está en tránsito.'),
    (3, 'SHIPMENT_IN_BRANCH', 'Tu envío está en sucursal', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} está en sucursal.'),
    (4, 'SHIPMENT_DELIVERED', 'Tu envío ha sido entregado', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} ha sido entregado.'),
    (5, 'SHIPMENT_CANCELLED', 'Tu envío ha sido cancelado', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} ha sido cancelado.'),
    (6, 'SHIPMENT_ASSIGNED', 'Tu envío ha sido asignado', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} ha sido asignado a un repartidor.'),
    (7, 'SHIPMENT_IN_PREPARATION', 'Tu envío está en preparación', 'Hola {{fullName}}, tu envío con ID {{trackingCode}} está siendo preparado para su entrega.'),
    (8, 'SHIPMENT_PACKAGE_FAILED', 'Tu paquete sufrió un daño — incidencia #{{incidentId}} ({{trackingCode}})', 'Hola {{fullName}},

Lamentamos informarte que tu paquete {{trackingCode}} sufrió un daño y no pudo entregarse.

Generamos automáticamente la incidencia #{{incidentId}} para gestionarlo. Podés ver el detalle y, si corresponde, elegir cómo resolverlo (reembolso o reemplazo) desde el portal:
{{incidentUrl}}

Si tenés alguna consulta, podés escribirnos respondiendo este correo.

Saludos,
{{senderName}}'),
    (9, 'SHIPMENT_FAILED_ATTEMPT', 'Intento de entrega fallido', 'Hola {{fullName}}, lamentamos informarte que el repartidor intentó entregar tu paquete con ID {{trackingCode}} pero no tuvo éxito. Por favor contacta a soporte para reprogramar la entrega.');


