-- LGT-210/209: nivel de demora del repartidor + reprogramación y propagación en cascada.
-- delay_level en la incidencia (DEMORADA / MUY_DEMORADA / REPROGRAMAR).
ALTER TABLE "logitrack"."incident"
    ADD COLUMN IF NOT EXISTS "delay_level" VARCHAR(20);

-- Reprogramación del envío (nivel REPROGRAMAR) + trazabilidad de demora propagada (LGT-209 Esc.4).
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "pending_reschedule"        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "reschedule_date"           DATE,
    ADD COLUMN IF NOT EXISTS "delay_origin_incident_id"  INTEGER REFERENCES "logitrack"."incident"("id");
