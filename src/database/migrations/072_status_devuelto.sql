-- #5 — Estado "Devuelto" (id 10): se aplica al envío cuando una devolución
-- (incidencia tipo RETURN) se resuelve como PROCEDENTE. Si es NO_PROCEDENTE,
-- el envío queda en su estado actual.
-- Idempotente: ON CONFLICT DO NOTHING para entornos ya seedeados.
INSERT INTO "logitrack"."status" ("id", "description") VALUES
    (10, 'Devuelto')
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
