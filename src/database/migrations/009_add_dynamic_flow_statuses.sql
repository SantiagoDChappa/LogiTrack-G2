-- Agrega los 4 estados nuevos del flujo dinamico (LGT-109)
-- Idempotente: ON CONFLICT DO NOTHING para entornos ya seedeados.
INSERT INTO "logitrack"."status" ("id", "description") VALUES
    (6, 'Asignado'),
    (7, 'En Preparacion'),
    (8, 'Paquete Fallido'),
    (9, 'Intento Fallido')
ON CONFLICT ("id") DO NOTHING;

-- Realinear secuencia del id por si la tabla la usa (no romper si no existe).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'status_id_seq'
    ) THEN
        PERFORM setval('logitrack.status_id_seq', GREATEST((SELECT MAX(id) FROM logitrack.status), 1));
    END IF;
END$$;
