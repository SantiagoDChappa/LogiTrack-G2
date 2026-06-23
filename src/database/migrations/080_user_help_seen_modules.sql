ALTER TABLE logitrack."user" ADD COLUMN IF NOT EXISTS help_seen_modules TEXT NOT NULL DEFAULT '{}';
