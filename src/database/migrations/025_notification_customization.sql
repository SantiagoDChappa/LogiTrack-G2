-- Migration 025 - Personalización de notificaciones
-- Variables custom, snippets/bloques de email y variantes de plantilla por evento.
-- Idempotente.

-- =========================================================================
-- 1) Variables custom (clave/valor) reutilizables en cualquier plantilla
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."notification_variable" (
    "id"          SERIAL       PRIMARY KEY,
    "key"         VARCHAR(60)  NOT NULL UNIQUE,
    "label"       VARCHAR(120) NOT NULL,
    "value"       TEXT         NOT NULL DEFAULT '',
    "description" VARCHAR(200) NULL
);

-- =========================================================================
-- 2) Snippets / bloques de email (HTML + texto), predefinidos y custom
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."email_snippet" (
    "id"      SERIAL       PRIMARY KEY,
    "key"     VARCHAR(60)  NOT NULL UNIQUE,
    "label"   VARCHAR(120) NOT NULL,
    "icon"    VARCHAR(40)  NULL,
    "html"    TEXT         NOT NULL DEFAULT '',
    "text"    TEXT         NOT NULL DEFAULT '',
    "builtin" BOOLEAN      NOT NULL DEFAULT false
);

-- Seed de los 5 bloques actuales como predefinidos. Idempotente por "key".
INSERT INTO "logitrack"."email_snippet" ("key","label","icon","html","text","builtin") VALUES
    ('reprogramar', 'Botón reprogramar', 'event_repeat',
     '<a href="{{selfServiceUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-weight:600">Reprogramar entrega</a>',
     'Reprogramá tu entrega o elegí retiro en sucursal: {{selfServiceUrl}}', true),
    ('seguimiento', 'Botón seguimiento', 'local_shipping',
     '<a href="{{trackingUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-weight:600">Ver seguimiento</a>',
     'Seguí tu envío: {{trackingUrl}}', true),
    ('incidencia', 'Botón incidencia', 'report',
     '<a href="{{incidentUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-weight:600">Reportar incidencia</a>',
     'Reportá un problema con tu envío: {{incidentUrl}}', true),
    ('saludo', 'Saludo', 'waving_hand',
     '<p>Hola <strong>{{fullName}}</strong>,</p>',
     'Hola {{fullName}},', true),
    ('firma', 'Firma', 'draw',
     '<p style="color:#64748b;font-size:13px">Equipo LogiTrack · Ante dudas, respondé este correo.</p>',
     E'\n— Equipo LogiTrack\nAnte dudas, respondé este correo.', true)
ON CONFLICT ("key") DO NOTHING;

-- =========================================================================
-- 3) Variantes de plantilla por evento: name + isDefault
-- =========================================================================
ALTER TABLE "logitrack"."email_template"
    ADD COLUMN IF NOT EXISTS "name" VARCHAR(80) NOT NULL DEFAULT 'Principal';
ALTER TABLE "logitrack"."email_template"
    ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: garantizar exactamente una predeterminada por evento.
-- (Las filas existentes ya quedan isDefault=true por el default; si hubiera
--  varias por evento en el futuro, esto deja como default la de menor id.)
UPDATE "logitrack"."email_template" t
   SET "isDefault" = (t."id" = sub.min_id)
  FROM (
        SELECT "eventCode", MIN("id") AS min_id
        FROM "logitrack"."email_template"
        GROUP BY "eventCode"
  ) sub
 WHERE t."eventCode" = sub."eventCode";

CREATE INDEX IF NOT EXISTS "idx_email_template_eventCode"
    ON "logitrack"."email_template" ("eventCode");
