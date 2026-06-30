-- ============================================================
-- 028) Ojo de Patrón — configuración, auditoría y contador de patrón
-- US-7 (config), US-8 (patrón), US-12 (retención/purga), US-14 (auditoría).
-- ============================================================

-- Parámetros configurables (branch_id NULL = valor global por defecto)
CREATE TABLE IF NOT EXISTS "logitrack"."fatigue_config" (
    "id"         SERIAL PRIMARY KEY,
    "branch_id"  INTEGER      NULL,
    "param"      VARCHAR(40)  NOT NULL,
    "value"      VARCHAR(40)  NOT NULL,
    "updated_by" INTEGER      NULL,
    "updated_at" TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_fcfg_branch" FOREIGN KEY ("branch_id") REFERENCES "logitrack"."branch"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fatigue_config_param"
    ON "logitrack"."fatigue_config" (COALESCE("branch_id", 0), "param");

-- Auditoría de accesos y acciones (US-14) + log de purga (US-12)
CREATE TABLE IF NOT EXISTS "logitrack"."fatigue_audit" (
    "id"         SERIAL PRIMARY KEY,
    "actor_id"   INTEGER      NULL,
    "action"     VARCHAR(40)  NOT NULL,
    "check_id"   INTEGER      NULL,
    "detail"     TEXT         NULL,
    "created_at" TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_fatigue_audit_created" ON "logitrack"."fatigue_audit" ("created_at" DESC);

-- Contador agregado de bloqueos por transportista. Sobrevive a la purga de
-- datos personales (US-12) para que la detección de patrón (US-8) siga siendo
-- posible sin conservar el dato biométrico ni el detalle del chequeo.
CREATE TABLE IF NOT EXISTS "logitrack"."fatigue_pattern_counter" (
    "user_id"       INTEGER   PRIMARY KEY,
    "blocked_count" INTEGER   NOT NULL DEFAULT 0,
    "last_event_at" TIMESTAMP NULL,
    CONSTRAINT "fk_fpc_user" FOREIGN KEY ("user_id") REFERENCES "logitrack"."user"("id") ON DELETE CASCADE
);
