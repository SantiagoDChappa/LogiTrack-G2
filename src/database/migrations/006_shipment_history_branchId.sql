ALTER TABLE "logitrack"."shipment_history"
    ADD COLUMN IF NOT EXISTS "branch_id" INTEGER REFERENCES "logitrack"."branch"("id");
