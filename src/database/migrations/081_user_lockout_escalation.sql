-- Reincidencia de bloqueos: cuántas veces se bloqueó la cuenta sin un login exitoso
-- de por medio. Se usa para escalar la duración (30 min -> 2 h -> 24 h).
ALTER TABLE logitrack."user"
    ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;
