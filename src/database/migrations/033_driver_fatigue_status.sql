-- Ojo de Patrón (LGT-195 Esc.7/8) — estado de habilitación del transportista.
-- La inhabilitación por rechazo de consentimiento o prueba no realizada vale
-- cross-ruta (no solo para la ruta en curso). El Supervisor lo restablece.

CREATE TABLE IF NOT EXISTS "logitrack"."driver_fatigue_status" (
    "user_id"      INTEGER PRIMARY KEY,
    "status"       VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | DISABLED
    "reason"       VARCHAR(30),                             -- CONSENT_REJECTED | TEST_NOT_DONE | OTHER
    "disabled_at"  TIMESTAMP,
    "restored_by"  INTEGER,
    "restored_at"  TIMESTAMP,
    "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_dfs_user" FOREIGN KEY ("user_id") REFERENCES "logitrack"."user"("id") ON DELETE CASCADE
);
