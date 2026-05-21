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
    (3, 'SHIPMENT_AT_BRANCH', 'notificacion de envio en sucursal'),
    (4, 'SHIPMENT_DELIVERED', 'notificacion de envio entregado'),
    (5, 'SHIPMENT_CANCELLED', 'notificacion de envio cancelado'),
    (6, 'SHIPMENT_ASSIGNED', 'notificacion de envio asignado'),
    (7, 'SHIPMENT_IN_PREPARATION', 'notificacion de envio en preparacion'),
    (8, 'SHIPMENT_PACKAGE_FAILED', 'notificacion de paquete fallido'),
    (9, 'SHIPMENT_FAILED_ATTEMPT', 'notificacion de intento de envio fallido');

INSERT INTO "logitrack"."notification_config" ("id", "eventId", "enabled") VALUES
    (1, 1, true),
    (2, 2, true),
    (3, 3, true),
    (4, 4, true),
    (5, 5, true),
    (6, 6, true),
    (7, 7, true),
    (8, 8, true),
    (9, 9, true);

INSERT INTO "logitrack"."email_template" ("id", "eventId", "subject", "body") VALUES
    (1, 1, 'Tu envío está pendiente', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} está pendiente.'),
    (2, 2, 'Tu envío está en tránsito', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} está en tránsito.'),
    (3, 3, 'Tu envío está en sucursal', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} está en sucursal.'),
    (4, 4, 'Tu envío ha sido entregado', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} ha sido entregado.'),
    (5, 5, 'Tu envío ha sido cancelado', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} ha sido cancelado.'),
    (6, 6, 'Tu envío ha sido asignado', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} ha sido asignado a un repartidor.'),
    (7, 7, 'Tu envío está en preparación', 'Hola {{fullName}}, tu envío con ID {{shipmentId}} está siendo preparado para su entrega.'),
    (8, 8, 'Hubo un problema con tu paquete', 'Hola {{fullName}}, lamentamos informarte que hubo un problema con tu paquete con ID {{shipmentId}}. Por favor contacta a soporte para más información.'),
    (9, 9, 'Intento de entrega fallido', 'Hola {{fullName}}, lamentamos informarte que el repartidor intentó entregar tu paquete con ID {{shipmentId}} pero no tuvo éxito. Por favor contacta a soporte para reprogramar la entrega.');


