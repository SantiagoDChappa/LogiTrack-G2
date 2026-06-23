-- Seed de ejemplo: asigna partidos (departamentos INDEC) a las zonas de CABA y
-- Buenos Aires para que el mapa se vea poblado. Capa visual: NO afecta costeo.
-- NO es migración a propósito (las migraciones corren en cada deploy y pisarían
-- las asignaciones manuales). Correr una sola vez:
--   node src/database/seed-zone-departamentos.js
-- Cada partido se asigna a una única zona (sin solapamiento).

-- ===== CABA (comunas) =====
UPDATE logitrack.zone SET departamento_ids = '["02098"]'::jsonb WHERE id = 1;   -- Palermo -> Comuna 14
UPDATE logitrack.zone SET departamento_ids = '["02091"]'::jsonb WHERE id = 2;   -- Belgrano -> Comuna 13
UPDATE logitrack.zone SET departamento_ids = '["02042"]'::jsonb WHERE id = 3;   -- Caballito -> Comuna 6
UPDATE logitrack.zone SET departamento_ids = '["02014"]'::jsonb WHERE id = 4;   -- Recoleta -> Comuna 2
UPDATE logitrack.zone SET departamento_ids = '["02007"]'::jsonb WHERE id = 5;   -- Microcentro -> Comuna 1
UPDATE logitrack.zone SET departamento_ids = '["02021","02035","02049","02056","02063","02070","02077"]'::jsonb WHERE id = 6;  -- Otros -> Comunas 3,5,7,8,9,10,11
UPDATE logitrack.zone SET departamento_ids = '["02105"]'::jsonb WHERE id = 1922; -- CABA Palermo -> Comuna 15
UPDATE logitrack.zone SET departamento_ids = '["02084"]'::jsonb WHERE id = 1923; -- CABA Belgrano -> Comuna 12
UPDATE logitrack.zone SET departamento_ids = '["02028"]'::jsonb WHERE id = 1924; -- CABA San Telmo -> Comuna 4

-- ===== Buenos Aires (conurbano) =====
-- GBA Norte
UPDATE logitrack.zone SET departamento_ids = '["06756","06861","06805","06749","06371","06760","06515","06412","06638","06252"]'::jsonb WHERE id = 1604;
-- GBA Oeste
UPDATE logitrack.zone SET departamento_ids = '["06427","06568","06539","06560","06410","06408","06840"]'::jsonb WHERE id = 1606;
-- GBA Sur
UPDATE logitrack.zone SET departamento_ids = '["06035","06434","06490","06658","06091","06274","06028","06260","06270","06648","06778"]'::jsonb WHERE id = 1605;
