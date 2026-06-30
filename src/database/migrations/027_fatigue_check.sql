-- ============================================================
-- 027) Ojo de Patrón — control de fatiga del transportista (Epic LGT-189)
-- Cubre US-1 (consentimiento), US-3 (score) y US-4 (bloqueo).
-- Ley 25.326: NO se persiste el dato biométrico crudo. Solo score + metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS "logitrack"."fatigue_check" (
    "id"              SERIAL PRIMARY KEY,
    "user_id"         INTEGER       NOT NULL,
    "route_id"        INTEGER       NULL,
    "branch_id"       INTEGER       NULL,
    "trigger_type"    VARCHAR(10)   NOT NULL DEFAULT 'INICIO',   -- INICIO | EN_RUTA
    "method"          VARCHAR(12)   NULL,                         -- VOZ | REACCION
    "consent_status"  VARCHAR(12)   NOT NULL DEFAULT 'PENDING',   -- PENDING | ACCEPTED | REJECTED
    "consent_version" VARCHAR(20)   NULL,
    "consent_at"      TIMESTAMP     NULL,
    "score"           SMALLINT      NULL,                         -- 0-100; NULL hasta evaluar
    "threshold"       SMALLINT      NULL,
    "decision"        VARCHAR(12)   NULL,                         -- APTO | BLOCKED
    "released_by"     INTEGER       NULL,
    "release_reason"  VARCHAR(60)   NULL,
    "release_detail"  TEXT          NULL,
    "released_at"     TIMESTAMP     NULL,
    "created_at"      TIMESTAMP     NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_fc_user"     FOREIGN KEY ("user_id")     REFERENCES "logitrack"."user"("id"),
    CONSTRAINT "fk_fc_route"    FOREIGN KEY ("route_id")    REFERENCES "logitrack"."route"("id")  ON DELETE SET NULL,
    CONSTRAINT "fk_fc_branch"   FOREIGN KEY ("branch_id")   REFERENCES "logitrack"."branch"("id") ON DELETE SET NULL,
    CONSTRAINT "fk_fc_released" FOREIGN KEY ("released_by") REFERENCES "logitrack"."user"("id")
);

CREATE INDEX IF NOT EXISTS "idx_fatigue_check_user"  ON "logitrack"."fatigue_check" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_fatigue_check_route" ON "logitrack"."fatigue_check" ("route_id");

COMMENT ON TABLE  "logitrack"."fatigue_check"        IS 'Ojo de Patrón: chequeos de fatiga. NO almacena biométrico crudo (Ley 25.326).';
COMMENT ON COLUMN "logitrack"."fatigue_check"."score" IS 'Resultado 0-100. El audio/datos crudos se descartan; solo se guarda el score.';
