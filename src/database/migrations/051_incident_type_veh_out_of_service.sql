-- Alta del tipo de incidencia "Vehículo fuera de servicio".
-- Idempotente: si ya existe el code, no hace nada.
INSERT INTO "logitrack"."incident_type" ("code", "description") VALUES
    ('VEH_OUT_OF_SERVICE', 'Vehículo fuera de servicio')
ON CONFLICT ("code") DO NOTHING;
