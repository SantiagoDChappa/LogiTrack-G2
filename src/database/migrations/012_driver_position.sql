CREATE TABLE IF NOT EXISTS "logitrack"."driver_position" (
    "id"          SERIAL PRIMARY KEY,
    "user_id"     INTEGER NOT NULL,
    "route_id"    INTEGER,
    "latitude"    NUMERIC(10,7) NOT NULL,
    "longitude"   NUMERIC(10,7) NOT NULL,
    "speed_kmh"   NUMERIC(6,2),
    "recorded_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_dpos_user"  FOREIGN KEY ("user_id")  REFERENCES "logitrack"."user"("id"),
    CONSTRAINT "fk_dpos_route" FOREIGN KEY ("route_id") REFERENCES "logitrack"."route"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_driver_position_user_recorded"
    ON "logitrack"."driver_position" ("user_id", "recorded_at" DESC);
