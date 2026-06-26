-- Devoluciones como incidencia: la devolución pasa a tratarse como un tipo de
-- incidencia más (merge del módulo de devoluciones dentro de Incidencias).
INSERT INTO "logitrack"."incident_type" ("code", "description") VALUES
    ('RETURN', 'Devolucion')
ON CONFLICT ("code") DO NOTHING;
