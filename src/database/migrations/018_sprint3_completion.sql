-- Sprint 3 completion migration
-- Covers: 2.1 timeline events, 2.3 notification events, 2.4 route failure flows,
-- 2.5 configurable params, 3.2 portal autogestion, 3.3 structured address,
-- 4.1 delivery secret code, 4.2 driver operating windows

-- =========================================================================
-- 3.3 Structured address fields
-- =========================================================================
ALTER TABLE "logitrack"."address"
    ADD COLUMN IF NOT EXISTS "ring_label"     VARCHAR(40),
    ADD COLUMN IF NOT EXISTS "floor_apt"      VARCHAR(40),
    ADD COLUMN IF NOT EXISTS "references_txt" TEXT,
    ADD COLUMN IF NOT EXISTS "porter_note"    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "restrictions"   TEXT;

-- =========================================================================
-- 4.1 Delivery secret code + portal autogestion token
-- =========================================================================
ALTER TABLE "logitrack"."shipment"
    ADD COLUMN IF NOT EXISTS "delivery_secret_code" VARCHAR(10),
    ADD COLUMN IF NOT EXISTS "portal_token"         VARCHAR(60);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_shipment_portal_token"
    ON "logitrack"."shipment" ("portal_token");

-- =========================================================================
-- 4.2 Driver operating windows + availability
-- =========================================================================
ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "driver_shift_start" TIME,
    ADD COLUMN IF NOT EXISTS "driver_shift_end"   TIME,
    ADD COLUMN IF NOT EXISTS "driver_available"   BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "driver_unavailable_reason" VARCHAR(120),
    ADD COLUMN IF NOT EXISTS "driver_unavailable_until"  DATE;

-- =========================================================================
-- Vehicle out-of-service flag
-- =========================================================================
ALTER TABLE "logitrack"."transport"
    ADD COLUMN IF NOT EXISTS "out_of_service"        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "out_of_service_reason" VARCHAR(160),
    ADD COLUMN IF NOT EXISTS "out_of_service_until"  DATE;

-- =========================================================================
-- 2.4 Route failure flows (cancel / interrupt + reason)
-- =========================================================================
ALTER TABLE "logitrack"."route"
    ADD COLUMN IF NOT EXISTS "cancel_reason"      VARCHAR(60),
    ADD COLUMN IF NOT EXISTS "cancel_detail"      TEXT,
    ADD COLUMN IF NOT EXISTS "cancelled_at"       TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" INTEGER,
    ADD COLUMN IF NOT EXISTS "interrupted_at"     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "interrupt_reason"   VARCHAR(60),
    ADD COLUMN IF NOT EXISTS "returned_to_branch" BOOLEAN NOT NULL DEFAULT FALSE;

-- =========================================================================
-- 2.5 Configurable params: failed-attempt reasons + reschedule rules
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."failed_attempt_reason" (
    "id"            SERIAL PRIMARY KEY,
    "code"          VARCHAR(40) NOT NULL UNIQUE,
    "label"         VARCHAR(120) NOT NULL,
    "active"        BOOLEAN NOT NULL DEFAULT TRUE,
    "retry_days"    INTEGER NOT NULL DEFAULT 1,
    "max_attempts_override" INTEGER,
    "creates_incident" BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO "logitrack"."failed_attempt_reason" ("code", "label", "retry_days", "creates_incident") VALUES
    ('cliente_ausente',  'Cliente ausente',           1, FALSE),
    ('domicilio_cerrado','Domicilio cerrado',         1, FALSE),
    ('domicilio_incorrecto','Domicilio incorrecto',   2, TRUE),
    ('rechazo_cliente',  'Cliente rechaza recepción', 0, TRUE),
    ('paquete_dañado',   'Paquete dañado',            0, TRUE),
    ('zona_inseguro',    'Zona insegura',             1, FALSE),
    ('clima',            'Condiciones climáticas',    1, FALSE),
    ('otro',             'Otro motivo',               1, FALSE)
ON CONFLICT ("code") DO NOTHING;

-- Standard messages (textos parametrizables)
CREATE TABLE IF NOT EXISTS "logitrack"."standard_message" (
    "id"     SERIAL PRIMARY KEY,
    "code"   VARCHAR(40) NOT NULL UNIQUE,
    "label"  VARCHAR(120) NOT NULL,
    "body"   TEXT NOT NULL
);

INSERT INTO "logitrack"."standard_message" ("code", "label", "body") VALUES
    ('reschedule_default',   'Reprogramación estándar', 'Tu envío fue reprogramado. Nuevo intento estimado: {{date}}.'),
    ('next_delivery_window', 'Aviso próxima entrega',   'Tu envío está en reparto y llegará en aproximadamente {{eta}} minutos.'),
    ('returned_to_branch',   'Devuelto a sucursal',     'Tu envío volvió a sucursal {{branch}}. Te avisaremos del próximo intento.')
ON CONFLICT ("code") DO NOTHING;

-- Available delivery time windows (franjas habilitadas globalmente)
CREATE TABLE IF NOT EXISTS "logitrack"."delivery_time_window" (
    "id"         SERIAL PRIMARY KEY,
    "label"      VARCHAR(40)  NOT NULL,
    "from_time"  TIME NOT NULL,
    "to_time"    TIME NOT NULL,
    "active"     BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO "logitrack"."delivery_time_window" ("label", "from_time", "to_time") VALUES
    ('Mañana',     '08:00', '12:00'),
    ('Mediodía',   '12:00', '15:00'),
    ('Tarde',      '15:00', '19:00'),
    ('Noche',      '19:00', '22:00')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 2.3 Extend notification events: tabla real es notification_events (plural)
-- y la columna es ENUM type_notification_event. Agregar nuevos valores al
-- ENUM antes de insertar.
-- =========================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_notification_event') THEN
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_OUT_FOR_DELIVERY';    EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_NEXT_DELIVERY';       EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_ARRIVED_DESTINATION'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_RETURNED_BRANCH';     EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_RESCHEDULED';         EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_INCIDENT';            EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'ROUTE_CANCELLED';              EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'ROUTE_INTERRUPTED';            EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END$$;
