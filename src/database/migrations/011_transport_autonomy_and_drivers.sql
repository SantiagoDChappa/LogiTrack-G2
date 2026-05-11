-- Migration 011 - LGT-134: Autonomia de transportes + asignacion automatica de drivers
-- Idempotente.

-- 1) Columna autonomy_km
ALTER TABLE "logitrack"."transport"
    ADD COLUMN IF NOT EXISTS "autonomy_km" INTEGER NULL;

-- 2) Default por categoria de peso (solo donde sea NULL)
UPDATE "logitrack"."transport"
SET "autonomy_km" = CASE
    WHEN "max_weight_kg" <= 50    THEN 200
    WHEN "max_weight_kg" <= 1000  THEN 500
    WHEN "max_weight_kg" <= 2000  THEN 700
    ELSE 1200
END
WHERE "autonomy_km" IS NULL;

-- 3) Asignar driver (roleId=3 active=true) a transports sin conductor.
--    Round-robin por id de driver para distribuir carga.
DO $$
DECLARE
    t RECORD;
    drv_ids INTEGER[];
    drv_count INTEGER;
    idx INTEGER := 0;
BEGIN
    SELECT array_agg("id" ORDER BY "id") INTO drv_ids
    FROM "logitrack"."user"
    WHERE "roleId" = 3 AND "active" = true;

    drv_count := COALESCE(array_length(drv_ids, 1), 0);
    IF drv_count = 0 THEN
        RAISE NOTICE 'Sin drivers disponibles (roleId=3 active=true). Se omite asignacion.';
        RETURN;
    END IF;

    FOR t IN
        SELECT "id" FROM "logitrack"."transport"
        WHERE "driver_user_id" IS NULL
        ORDER BY "id"
    LOOP
        UPDATE "logitrack"."transport"
        SET "driver_user_id" = drv_ids[(idx % drv_count) + 1]
        WHERE "id" = t."id";
        idx := idx + 1;
    END LOOP;
END $$;
