-- ============================================================
-- LogiTrack - Seed: una sucursal por capital provincial
-- Idempotente: solo inserta si la provincia no tiene branch aún
-- ============================================================

SET search_path TO logitrack;

INSERT INTO "branch" (name, province_id, latitude, longitude, address, postal_code)
SELECT v.name, v.province_id, v.latitude, v.longitude, v.address, v.postal_code
FROM (VALUES
    ('Sucursal La Plata',             1,  -34.9205,  -57.9536, 'Av. 7 Nro 855',            'B1900'),
    ('Sucursal Catamarca',            2,  -28.4696,  -65.7795, 'Av. Güemes 520',            'K4700'),
    ('Sucursal Resistencia',          3,  -27.4515,  -58.9866, 'Av. 9 de Julio 100',        'H3500'),
    ('Sucursal Rawson',               4,  -43.3002,  -65.1023, 'Av. Fontana 50',            'U9103'),
    ('Sucursal Córdoba',              5,  -31.4201,  -64.1888, 'Bv. San Juan 500',          'X5000'),
    ('Sucursal Corrientes',           6,  -27.4806,  -58.8341, 'Av. 3 de Abril 300',        'W3400'),
    ('Sucursal Paraná',               7,  -31.7333,  -60.5283, 'Av. Alameda 200',           'E3100'),
    ('Sucursal Formosa',              8,  -26.1775,  -58.1781, 'Av. 25 de Mayo 150',        'P3600'),
    ('Sucursal Jujuy',                9,  -24.1858,  -65.2995, 'Av. Dorrego 800',           'Y4600'),
    ('Sucursal Santa Rosa',          10,  -36.6167,  -64.2833, 'Av. San Martín 1200',       'L6300'),
    ('Sucursal La Rioja',            11,  -29.4132,  -66.8558, 'Av. Ortiz de Ocampo 500',   'F5300'),
    ('Sucursal Mendoza',             12,  -32.8908,  -68.8272, 'Av. Las Heras 600',         'M5500'),
    ('Sucursal Posadas',             13,  -27.3671,  -55.8961, 'Av. Mitre 400',             'N3300'),
    ('Sucursal Neuquén',             14,  -38.9516,  -68.0591, 'Av. Argentina 800',         'Q8300'),
    ('Sucursal Viedma',              15,  -40.8135,  -62.9967, 'Av. Rivadavia 300',         'R8500'),
    ('Sucursal Salta',               16,  -24.7883,  -65.4116, 'Av. Belgrano 700',          'A4400'),
    ('Sucursal San Juan',            17,  -31.5375,  -68.5364, 'Av. Rawson 200',            'J5400'),
    ('Sucursal San Luis',            18,  -33.3023,  -66.3356, 'Av. Illia 100',             'D5700'),
    ('Sucursal Río Gallegos',        19,  -51.6230,  -69.2168, 'Av. San Martín 50',         'Z9400'),
    ('Sucursal Santa Fe',            20,  -31.6333,  -60.7000, 'Av. Freyre 1200',           'S3000'),
    ('Sucursal Santiago del Estero', 21,  -27.7951,  -64.2615, 'Av. Belgrano 100',          'G4200'),
    ('Sucursal Ushuaia',             22,  -54.8019,  -68.3030, 'Av. Maipú 200',             'V9410'),
    ('Sucursal Tucumán',             23,  -26.8083,  -65.2176, 'Av. Mate de Luna 500',      'T4000'),
    ('Sucursal Buenos Aires',        24,  -34.6037,  -58.3816, 'Av. Corrientes 1234',       'C1043')
) AS v(name, province_id, latitude, longitude, address, postal_code)
WHERE NOT EXISTS (
    SELECT 1 FROM "branch" b WHERE b.province_id = v.province_id
);
