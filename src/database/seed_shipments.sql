-- ============================================================
-- LogiTrack - Seed: Envíos de prueba con datos completos
-- Idempotente: se omite si ya existen envíos con trackingId SEED-*
-- ============================================================

SET search_path TO logitrack;

DO $$
DECLARE
    -- Senders
    s1 INTEGER; s2 INTEGER; s3 INTEGER; s4 INTEGER; s5 INTEGER; s6 INTEGER;
    -- Recipients
    r1 INTEGER; r2 INTEGER; r3 INTEGER; r4 INTEGER; r5 INTEGER; r6 INTEGER;
    -- Addresses
    a1 INTEGER; a2 INTEGER; a3 INTEGER; a4 INTEGER;
    a5 INTEGER; a6 INTEGER; a7 INTEGER; a8 INTEGER;
    -- Delivery users (repartidores)
    u_carlos INTEGER; u_maria INTEGER; u_pedro INTEGER;
    -- Branches
    b_bsas INTEGER; b_cba INTEGER; b_ros INTEGER;
BEGIN

    -- Idempotencia
    IF EXISTS (SELECT 1 FROM shipment WHERE "trackingId" LIKE 'SEED-%') THEN
        RAISE NOTICE 'seed_shipments ya aplicado. Se omite.';
        RETURN;
    END IF;

    -- --------------------------------------------------------
    -- Repartidores y sucursales (referenciados por datos únicos)
    -- --------------------------------------------------------
    SELECT id INTO u_carlos FROM "user" WHERE email = 'carlos@logitrack.com.ar' LIMIT 1;
    SELECT id INTO u_maria  FROM "user" WHERE email = 'maria@logitrack.com.ar'  LIMIT 1;
    SELECT id INTO u_pedro  FROM "user" WHERE email = 'pedro@logitrack.com.ar'  LIMIT 1;

    SELECT id INTO b_bsas FROM branch WHERE province_id = 24 LIMIT 1;
    SELECT id INTO b_cba  FROM branch WHERE province_id =  5 LIMIT 1;
    SELECT id INTO b_ros  FROM branch WHERE province_id = 20 LIMIT 1;

    -- --------------------------------------------------------
    -- Personas - Remitentes
    -- --------------------------------------------------------
    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Laura Fernández', 30100001, '1140001001', 'laura.fernandez@seed.com')
    RETURNING id INTO s1;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Martín García', 30100002, '1140002002', 'martin.garcia@seed.com')
    RETURNING id INTO s2;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Ana Torres', 30100003, '1140003003', 'ana.torres@seed.com')
    RETURNING id INTO s3;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Roberto Díaz', 30100004, '1140004004', 'roberto.diaz@seed.com')
    RETURNING id INTO s4;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Cecilia López', 30100005, '1140005005', 'cecilia.lopez@seed.com')
    RETURNING id INTO s5;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Fernando Ruiz', 30100006, '1140006006', 'fernando.ruiz@seed.com')
    RETURNING id INTO s6;

    -- --------------------------------------------------------
    -- Personas - Destinatarios
    -- --------------------------------------------------------
    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Valentina Romero', 40200001, '1150001001', 'valentina.romero@seed.com')
    RETURNING id INTO r1;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Diego Pérez', 40200002, '1150002002', 'diego.perez@seed.com')
    RETURNING id INTO r2;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Luciana Morales', 40200003, '1150003003', 'luciana.morales@seed.com')
    RETURNING id INTO r3;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Sebastián Castro', 40200004, '1150004004', 'sebastian.castro@seed.com')
    RETURNING id INTO r4;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Natalia Vega', 40200005, '1150005005', 'natalia.vega@seed.com')
    RETURNING id INTO r5;

    INSERT INTO person ("fullName", "document", "phone", "email")
    VALUES ('Joaquín Herrera', 40200006, '1150006006', 'joaquin.herrera@seed.com')
    RETURNING id INTO r6;

    -- --------------------------------------------------------
    -- Direcciones de entrega
    -- --------------------------------------------------------
    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Corrientes', 1234, 24, 'C1043', NULL, -34.6037, -58.3816)
    RETURNING id INTO a1;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Rivadavia', 3456, 24, 'C1204', 'PB A', -34.6098, -58.4192)
    RETURNING id INTO a2;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Bv. San Juan', 500, 5, 'X5000', NULL, -31.4201, -64.1888)
    RETURNING id INTO a3;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Freyre', 1200, 20, 'S3000', '2° B', -31.6333, -60.7000)
    RETURNING id INTO a4;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Las Heras', 600, 12, 'M5500', NULL, -32.8908, -68.8272)
    RETURNING id INTO a5;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Belgrano', 700, 16, 'A4400', '3° C', -24.7883, -65.4116)
    RETURNING id INTO a6;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. 7', 855, 1, 'B1900', NULL, -34.9205, -57.9536)
    RETURNING id INTO a7;

    INSERT INTO address ("street", "number", "provinceId", "postalCode", "floorApartment", "lat", "lng")
    VALUES ('Av. Mate de Luna', 500, 23, 'T4000', '1° A', -26.8083, -65.2176)
    RETURNING id INTO a8;

    -- --------------------------------------------------------
    -- Envíos — 10 registros con todos los estados posibles
    -- --------------------------------------------------------

    -- 1. PENDIENTE - Express (sin asignar)
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-001', 1, s1, r1, a1,
        1, 2.50, 0.015, 1,
        b_bsas, CURRENT_DATE + INTERVAL '3 days', NOW(), NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '2 days'
    FROM shipment WHERE "trackingId" = 'SEED-001';

    -- 2. PENDIENTE - Estándar (con sucursal de origen)
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-002', 1, s2, r2, a2,
        2, 5.00, 0.040, 2,
        b_bsas, CURRENT_DATE + INTERVAL '5 days', NOW() - INTERVAL '1 day', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '1 day'
    FROM shipment WHERE "trackingId" = 'SEED-002';

    -- 3. EN TRÁNSITO - Express, asignado a Carlos
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "deliveryUserId", "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-003', 2, s3, r3, a3,
        1, 1.20, 0.008, 1,
        u_carlos, b_bsas, CURRENT_DATE + INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '3 days'
    FROM shipment WHERE "trackingId" = 'SEED-003';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 2, 'Envío despachado desde sucursal', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '1 day'
    FROM shipment WHERE "trackingId" = 'SEED-003';

    -- 4. EN TRÁNSITO - Estándar, asignado a María
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "deliveryUserId", "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-004', 2, s4, r4, a4,
        2, 8.75, 0.060, 3,
        u_maria, b_cba, CURRENT_DATE + INTERVAL '2 days', NOW() - INTERVAL '4 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '4 days'
    FROM shipment WHERE "trackingId" = 'SEED-004';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 2, 'Salió de sucursal Córdoba', u_maria, 'STATUS_CHANGE', NOW() - INTERVAL '2 days'
    FROM shipment WHERE "trackingId" = 'SEED-004';

    -- 5. EN SUCURSAL - esperando retiro
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-005', 3, s5, r5, a5,
        1, 3.00, 0.020, 1,
        b_cba, CURRENT_DATE, NOW() - INTERVAL '5 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '5 days'
    FROM shipment WHERE "trackingId" = 'SEED-005';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 2, 'En camino a sucursal destino', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '3 days'
    FROM shipment WHERE "trackingId" = 'SEED-005';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 2, 3, 'Recibido en sucursal Córdoba', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '1 day'
    FROM shipment WHERE "trackingId" = 'SEED-005';

    -- 6. ENTREGADO - Express, entregado por Pedro
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "deliveryUserId", "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-006', 4, s6, r6, a6,
        1, 0.80, 0.005, 1,
        u_pedro, b_ros, CURRENT_DATE - INTERVAL '1 day', NOW() - INTERVAL '7 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '7 days'
    FROM shipment WHERE "trackingId" = 'SEED-006';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 2, 'Despachado', u_pedro, 'STATUS_CHANGE', NOW() - INTERVAL '5 days'
    FROM shipment WHERE "trackingId" = 'SEED-006';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 2, 4, 'Entregado al destinatario con firma', u_pedro, 'STATUS_CHANGE', NOW() - INTERVAL '1 day'
    FROM shipment WHERE "trackingId" = 'SEED-006';

    -- 7. ENTREGADO - Estándar (flujo completo con intento fallido)
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "deliveryUserId", "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-007', 4, s1, r2, a7,
        2, 12.00, 0.080, 4,
        u_carlos, b_bsas, CURRENT_DATE - INTERVAL '2 days', NOW() - INTERVAL '10 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '10 days'
    FROM shipment WHERE "trackingId" = 'SEED-007';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 2, 'Despachado', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '7 days'
    FROM shipment WHERE "trackingId" = 'SEED-007';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 2, 9, 'Destinatario ausente - 1er intento', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '4 days'
    FROM shipment WHERE "trackingId" = 'SEED-007';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 9, 2, 'Segundo intento programado', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '3 days'
    FROM shipment WHERE "trackingId" = 'SEED-007';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 2, 4, 'Entregado exitosamente', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '2 days'
    FROM shipment WHERE "trackingId" = 'SEED-007';

    -- 8. CANCELADO - cliente solicitó cancelación
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-008', 5, s2, r3, a8,
        2, 4.50, 0.030, 2,
        b_bsas, CURRENT_DATE - INTERVAL '3 days', NOW() - INTERVAL '6 days', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '6 days'
    FROM shipment WHERE "trackingId" = 'SEED-008';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 5, 'Cancelado a pedido del remitente', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '4 days'
    FROM shipment WHERE "trackingId" = 'SEED-008';

    -- 9. ASIGNADO - repartidor asignado, pendiente de salida
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "deliveryUserId", "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-009', 6, s3, r4, a1,
        1, 1.80, 0.012, 1,
        u_carlos, b_bsas, CURRENT_DATE + INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '1 day'
    FROM shipment WHERE "trackingId" = 'SEED-009';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 6, 'Asignado a repartidor', u_carlos, 'STATUS_CHANGE', NOW() - INTERVAL '2 hours'
    FROM shipment WHERE "trackingId" = 'SEED-009';

    -- 10. EN PREPARACIÓN - preparando en sucursal
    INSERT INTO shipment (
        "trackingId", "statusId", "senderId", "recipientId", "addressId",
        "shipmentTypeId", "weightKg", "volumeM3", "packageQty",
        "currentBranchId", "expectedDeliveryDate", "createdAt", "updatedAt"
    ) VALUES (
        'SEED-010', 7, s4, r5, a2,
        2, 6.30, 0.045, 3,
        b_ros, CURRENT_DATE + INTERVAL '4 days', NOW() - INTERVAL '12 hours', NOW()
    );
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, NULL, 1, 'Envío creado', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '12 hours'
    FROM shipment WHERE "trackingId" = 'SEED-010';
    INSERT INTO shipment_history ("shipmentId","fromStatusId","toStatusId","comment","userId","eventType","changedAt")
    SELECT id, 1, 7, 'En preparación en sucursal Rosario', NULL, 'STATUS_CHANGE', NOW() - INTERVAL '6 hours'
    FROM shipment WHERE "trackingId" = 'SEED-010';

    RAISE NOTICE 'seed_shipments aplicado: 10 envíos creados (SEED-001 a SEED-010).';
END $$;
