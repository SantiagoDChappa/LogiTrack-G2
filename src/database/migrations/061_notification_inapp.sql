-- LGT-218: centro de notificaciones in-app. Una fila por notificación y usuario destinatario.
-- Retención sugerida 90 días por usuario (purga vía servicio/job).
CREATE TABLE IF NOT EXISTS "logitrack"."notification_inapp" (
    "id"           SERIAL PRIMARY KEY,
    "userId"       INTEGER NOT NULL REFERENCES "logitrack"."user"("id") ON DELETE CASCADE,
    "event"        VARCHAR(64),
    "title"        VARCHAR(200) NOT NULL,
    "body"         TEXT,
    "resourceType" VARCHAR(32),   -- 'shipment' | 'incident' | 'return' | null
    "resourceId"   INTEGER,
    "url"          VARCHAR(300),  -- destino al clickear (detalle del recurso)
    "readAt"       TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No leídas por usuario (badge) y listado cronológico por usuario.
CREATE INDEX IF NOT EXISTS "idx_notif_inapp_user_unread"
    ON "logitrack"."notification_inapp" ("userId", "readAt");
CREATE INDEX IF NOT EXISTS "idx_notif_inapp_user_created"
    ON "logitrack"."notification_inapp" ("userId", "createdAt" DESC);
