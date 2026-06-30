-- Migration 001 - SCRUM-23
-- Agrega userId y eventType a shipment_history para soportar la linea de tiempo del envio.
-- Idempotente: seguro de re-ejecutar.

ALTER TABLE "logitrack"."shipment_history"
    ADD COLUMN IF NOT EXISTS "userId"    int,
    ADD COLUMN IF NOT EXISTS "eventType" varchar NOT NULL DEFAULT 'STATUS_CHANGE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_history_userId'
    ) THEN
        ALTER TABLE "logitrack"."shipment_history"
            ADD CONSTRAINT "fk_history_userId"
            FOREIGN KEY ("userId") REFERENCES "logitrack"."user"("id");
    END IF;
END$$;
