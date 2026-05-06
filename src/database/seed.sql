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

-- users
INSERT INTO "logitrack"."user" ("fullName", "email", "password", "document", "roleId") VALUES
    ('Santiago Chappa',         'santiagochappa@logitrack.com.ar',      '$2b$12$GiN3kS0fdJMsjJSymc6HAuNYtIOmjMLf/QieEw2Y4dwxKstQWC5Oa', 45202349,   1),
    ('Amin',                    'amin@logitrack.com.ar',                '$2b$12$eqMriItP1Z9X7kKZL9iHyurmsTwsYX8OBGSvibhvM6eGfZlgFK/za', 1123233434, 1),
    ('Juan',                    'juan@logitrack.com.ar',                '$2b$12$A4eIs04S45G3LAenyjt8h.Etu57ieZpjHdD.P3WSdmnLWeO4rNxnK',  1109987765, 1),
    ('Juan OP',                 'juanoperador@logitrack.com.ar',        '$2b$12$0FghDPRkMXlET7XfKvRNXOORzwmo0qP7OJ.becrlMtDmUtuP4Uv82', 1198989898, 2),
    ('Amin OP',                 'aminoperador@logitrack.com.ar',        '$2b$12$Y2tw4Fb5Vu3hB2x6boSVCulGoYLRDAcjhpviVgBNxatfcQnVz72wS', 11099087,   2),
    ('Maximo Valentin Flores',  'floresmaximovalentin@gmail.com',       '$2b$12$QeMel/akGF9KTkQXqnXtWeP4.TyyNeUJdcW6gChg.5iu7kK7O2JUG', 43503918,   1),
    ('Rubi Rose',               'rubirose@gmail.com',                   '$2b$12$zPvoebtpukk2aNU276GJXOLDtgOk2IBeG6eMhlDnRm.eJnO7PQL92', 1111,       2);

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
