-- ============================================================
-- LogiTrack - Seed: Zonas y Transportes con conductores
-- Idempotente: skip si ya existen transportes con plate SEED-*
-- ============================================================
-- Nota: Las zonas CABA (province_id=24) ya las inserta migration 010.
--       Este seed agrega provincias restantes + transportes por sucursal.
-- ============================================================

SET search_path TO logitrack;

-- Asegurar columnas de sobrecargo en zone (no están en migration 010)
ALTER TABLE zone ADD COLUMN IF NOT EXISTS "surcharge_per_kg" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE zone ADD COLUMN IF NOT EXISTS "surcharge_per_m3" DECIMAL(8,2) NOT NULL DEFAULT 0;

DO $$
DECLARE
    -- Zone IDs
    z_bsas   INTEGER;  -- Buenos Aires provincia
    z_cba    INTEGER;  -- Córdoba
    z_ros    INTEGER;  -- Santa Fe / Rosario
    z_mza    INTEGER;  -- Mendoza
    z_tuc    INTEGER;  -- Tucumán
    z_sal    INTEGER;  -- Salta
    z_lp     INTEGER;  -- La Pampa
    z_nqn    INTEGER;  -- Neuquén

    -- Branch IDs
    b_bsas   INTEGER;
    b_cba    INTEGER;
    b_ros    INTEGER;

    -- Driver user IDs
    u_carlos INTEGER;
    u_maria  INTEGER;
    u_pedro  INTEGER;

    -- Transport IDs
    t1 INTEGER; t2 INTEGER; t3 INTEGER;
    t4 INTEGER; t5 INTEGER; t6 INTEGER;
BEGIN

    -- Idempotencia
    IF EXISTS (SELECT 1 FROM transport WHERE plate LIKE 'SEED-%') THEN
        RAISE NOTICE 'seed_zones_transports ya aplicado. Se omite.';
        RETURN;
    END IF;

    -- --------------------------------------------------------
    -- Referencias: sucursales y conductores
    -- --------------------------------------------------------
    SELECT id INTO b_bsas FROM branch WHERE province_id = 24 LIMIT 1;
    SELECT id INTO b_cba  FROM branch WHERE province_id =  5 LIMIT 1;
    SELECT id INTO b_ros  FROM branch WHERE province_id = 20 LIMIT 1;

    SELECT id INTO u_carlos FROM "user" WHERE email = 'carlos@logitrack.com.ar' LIMIT 1;
    SELECT id INTO u_maria  FROM "user" WHERE email = 'maria@logitrack.com.ar'  LIMIT 1;
    SELECT id INTO u_pedro  FROM "user" WHERE email = 'pedro@logitrack.com.ar'  LIMIT 1;

    -- --------------------------------------------------------
    -- Zonas por provincia (sin repetir las de CABA de migration 010)
    -- --------------------------------------------------------

    -- Buenos Aires Provincia (GBA + interior)
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('GBA Norte', 1, 600, 15.00, 80.00, '["1600","1601","1602","1605","1607","1609","1611","1613","1615","1617","1619","1621","1623","1625","1627","1629","1631","1633","1635","1637","1639","1641","1643","1645","1647","1648","1649","1650","1651","1652","1653","1654","1655","1656","1657","1658","1659","1661","1663","1665","1667","1669","1671","1673","1675"]'::jsonb, true)
    RETURNING id INTO z_bsas;

    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('GBA Sur', 1, 650, 18.00, 90.00, '["1820","1822","1824","1826","1828","1832","1834","1836","1838","1840","1842","1844","1846","1848","1850","1852","1854","1856","1858","1860","1862","1864","1866","1868","1870","1872","1874","1876","1900","1902","1904"]'::jsonb, true);

    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('GBA Oeste', 1, 620, 16.00, 85.00, '["1700","1702","1704","1706","1708","1710","1712","1714","1716","1718","1720","1722","1724","1726","1727","1728","1730","1732","1734","1736","1738","1740","1742","1744","1746","1748","1750","1752","1754","1756","1758","1760","1762","1764","1766"]'::jsonb, true);

    -- Córdoba
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Córdoba Capital', 5, 700, 20.00, 100.00, '["5000","5001","5002","5003","5004","5005","5006","5007","5008","5009","5010","5011","5012","5013","5014","5015","5016"]'::jsonb, true)
    RETURNING id INTO z_cba;

    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Córdoba Interior', 5, 900, 25.00, 130.00, NULL, true);

    -- Santa Fe / Rosario
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Rosario', 20, 680, 18.00, 95.00, '["2000","2001","2002","2003","2004","2005","2006","2007","2008","2009","2010","2011","2012","2013","2014","2016","2017","2018","2019","2020"]'::jsonb, true)
    RETURNING id INTO z_ros;

    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Santa Fe Capital', 20, 720, 20.00, 105.00, '["3000","3001","3002","3003","3004","3005","3006","3007","3008","3009","3010","3011","3012","3013","3014","3015","3016","3017","3018","3019","3020"]'::jsonb, true);

    -- Mendoza
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Mendoza Capital', 12, 850, 22.00, 115.00, '["5500","5501","5502","5503","5504","5505","5506","5507","5508","5509","5510","5511","5512","5513","5514","5515","5516","5517","5518","5519","5520","5521","5522","5523","5524","5525"]'::jsonb, true)
    RETURNING id INTO z_mza;

    -- Tucumán
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Tucumán Capital', 23, 900, 24.00, 120.00, '["4000","4001","4002","4003","4004","4005","4006","4007","4008","4009","4010","4011","4012","4013","4014","4015","4016","4017","4018","4019","4020"]'::jsonb, true)
    RETURNING id INTO z_tuc;

    -- Salta
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Salta Capital', 16, 950, 26.00, 130.00, '["4400","4401","4402","4403","4404","4405","4406","4407","4408","4409","4410","4411","4412","4413","4414","4415","4416","4417","4418","4419","4420"]'::jsonb, true)
    RETURNING id INTO z_sal;

    -- La Pampa
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('La Pampa', 10, 1000, 28.00, 140.00, NULL, true)
    RETURNING id INTO z_lp;

    -- Neuquén
    INSERT INTO zone (name, province_id, base_cost, surcharge_per_kg, surcharge_per_m3, postal_code_prefixes, enabled)
    VALUES ('Neuquén Capital', 14, 980, 27.00, 135.00, '["8300","8301","8302","8303","8304","8305","8306","8307","8308","8309","8310"]'::jsonb, true)
    RETURNING id INTO z_nqn;

    -- --------------------------------------------------------
    -- Transportes con conductores obligatorios
    -- --------------------------------------------------------

    -- Sucursal Buenos Aires: 2 vehículos
    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Furgón BA-01', 'SEED-BA01', 500.00, 3.000, 1200.00, 25.00, 300, u_carlos, b_bsas, true)
    RETURNING id INTO t1;

    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Camioneta BA-02', 'SEED-BA02', 200.00, 1.500, 800.00, 18.00, 400, u_carlos, b_bsas, true)
    RETURNING id INTO t2;

    -- Sucursal Córdoba: 2 vehículos
    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Furgón CBA-01', 'SEED-CBA1', 500.00, 3.000, 1100.00, 23.00, 350, u_maria, b_cba, true)
    RETURNING id INTO t3;

    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Moto CBA-02', 'SEED-CBA2', 30.00, 0.200, 200.00, 8.00, 150, u_maria, b_cba, true)
    RETURNING id INTO t4;

    -- Sucursal Rosario: 2 vehículos
    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Furgón ROS-01', 'SEED-ROS1', 500.00, 3.000, 1050.00, 22.00, 320, u_pedro, b_ros, true)
    RETURNING id INTO t5;

    INSERT INTO transport (name, plate, max_weight_kg, max_volume_m3, fixed_cost, cost_per_km, autonomy_km, driver_user_id, branch_id, enabled)
    VALUES ('Camioneta ROS-02', 'SEED-ROS2', 250.00, 2.000, 900.00, 20.00, 380, u_pedro, b_ros, true)
    RETURNING id INTO t6;

    -- --------------------------------------------------------
    -- Asociaciones Transporte ↔ Zona
    -- --------------------------------------------------------

    -- BA-01 y BA-02: cubren GBA Norte, GBA Sur, GBA Oeste + zonas CABA
    INSERT INTO transport_zone (transport_id, zone_id)
    SELECT t1, id FROM zone WHERE province_id IN (1, 24) AND enabled = true
    ON CONFLICT DO NOTHING;

    INSERT INTO transport_zone (transport_id, zone_id)
    SELECT t2, id FROM zone WHERE province_id IN (1, 24) AND enabled = true
    ON CONFLICT DO NOTHING;

    -- CBA-01: Córdoba Capital + Interior
    INSERT INTO transport_zone (transport_id, zone_id)
    SELECT t3, id FROM zone WHERE province_id = 5 AND enabled = true
    ON CONFLICT DO NOTHING;

    -- CBA-02 (moto): solo Córdoba Capital
    INSERT INTO transport_zone (transport_id, zone_id)
    VALUES (t4, z_cba)
    ON CONFLICT DO NOTHING;

    -- ROS-01: Rosario + Santa Fe Capital
    INSERT INTO transport_zone (transport_id, zone_id)
    SELECT t5, id FROM zone WHERE province_id = 20 AND enabled = true
    ON CONFLICT DO NOTHING;

    -- ROS-02: Rosario
    INSERT INTO transport_zone (transport_id, zone_id)
    VALUES (t6, z_ros)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'seed_zones_transports aplicado: 10 zonas + 6 transportes creados.';
END $$;
