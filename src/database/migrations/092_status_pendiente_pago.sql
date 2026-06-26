-- Estado "Pendiente de Pago" (id 11): paso opcional antes del flujo normal,
-- para envíos donde se eligió "pago antes de despachar" al crearlos. El envío
-- queda acá hasta que se registra el cobro (operador o Mercado Pago), y recién
-- ahí pasa a Pendiente (id 1) como cualquier otro envío.
-- Idempotente: ON CONFLICT DO NOTHING para entornos ya seedeados.
INSERT INTO "logitrack"."status" ("id", "description") VALUES
    (11, 'Pendiente de Pago')
ON CONFLICT ("id") DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'status_id_seq'
    ) THEN
        PERFORM setval('logitrack.status_id_seq', GREATEST((SELECT MAX(id) FROM logitrack.status), 1));
    END IF;
END$$;
