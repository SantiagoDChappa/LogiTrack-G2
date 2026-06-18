-- LGT-219: canales de notificación por evento (in-app / email / SMS), multi-selección.
-- Default 'email' para preservar el comportamiento previo (todos los eventos eran solo email).
ALTER TABLE "logitrack"."notification_config"
    ADD COLUMN IF NOT EXISTS "channels" VARCHAR(60) NOT NULL DEFAULT 'email';

-- Las filas existentes quedan en 'email' por el DEFAULT (comportamiento idéntico al actual).
