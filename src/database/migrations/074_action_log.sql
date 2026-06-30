CREATE TABLE IF NOT EXISTS logitrack.action_log (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES logitrack.user(id) ON DELETE SET NULL,
    action     VARCHAR(30)  NOT NULL,   -- CREATE | UPDATE | DELETE | STATUS_CHANGE | CANCEL | CLOSE | ASSIGN | ESCALATE
    entity     VARCHAR(20)  NOT NULL,   -- SHIPMENT | USER | INCIDENT
    entity_id  INTEGER,
    detail     TEXT,
    ip         VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_log_user_id    ON logitrack.action_log(user_id);
CREATE INDEX IF NOT EXISTS idx_action_log_entity     ON logitrack.action_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_action_log_created_at ON logitrack.action_log(created_at DESC);
