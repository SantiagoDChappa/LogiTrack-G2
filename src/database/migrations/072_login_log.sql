CREATE TABLE IF NOT EXISTS logitrack.login_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES logitrack.user(id) ON DELETE SET NULL,
    action      VARCHAR(10)  NOT NULL,  -- 'LOGIN' | 'LOGOUT'
    ip          VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_log_user_id    ON logitrack.login_log(user_id);
CREATE INDEX IF NOT EXISTS idx_login_log_created_at ON logitrack.login_log(created_at DESC);
