-- Migration 012 - LGT-47: Gestion de incidencias (tickets)
-- Crea tablas incident_type, incident, incident_history.
-- Idempotente: seguro de re-ejecutar.
--
-- Nota: existen restos de un intento previo (tablas incident / incident_history
-- con otro esquema, p.ej. ticketCode/reporterType/category) que nunca fueron
-- committeadas en ninguna branch. Las descartamos UNICAMENTE si detectamos su
-- esquema viejo, para que esta migracion sea segura de re-ejecutar sin perder
-- datos en arranques posteriores.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='logitrack' AND table_name='incident' AND column_name='ticketCode'
    ) THEN
        EXECUTE 'DROP TABLE IF EXISTS "logitrack"."incident_history" CASCADE';
        EXECUTE 'DROP TABLE IF EXISTS "logitrack"."incident"         CASCADE';
    END IF;
END$$;

-- 1) Catalogo de tipos de incidencia
CREATE TABLE IF NOT EXISTS "logitrack"."incident_type" (
    "id"          SERIAL       PRIMARY KEY,
    "code"        VARCHAR(40)  NOT NULL UNIQUE,
    "description" VARCHAR(120) NOT NULL,
    "active"      BOOLEAN      NOT NULL DEFAULT true
);

INSERT INTO "logitrack"."incident_type" ("code", "description") VALUES
    ('PACKAGE_BROKEN', 'Paquete roto o danado'),
    ('DELAY',          'Envio demorado'),
    ('MISSING_ITEM',   'Faltante en el envio'),
    ('WRONG_ADDRESS',  'Direccion incorrecta'),
    ('LOST',           'Paquete perdido'),
    ('OTHER',          'Otro')
ON CONFLICT ("code") DO NOTHING;

-- 2) Tabla principal de incidencias
CREATE TABLE IF NOT EXISTS "logitrack"."incident" (
    "id"               SERIAL       PRIMARY KEY,
    "shipmentId"       INTEGER      NOT NULL,
    "incidentTypeId"   INTEGER      NOT NULL,
    "status"           VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    "priority"         SMALLINT     NOT NULL DEFAULT 2,
    "escalated"        BOOLEAN      NOT NULL DEFAULT false,
    "resolution"       VARCHAR(20)  NULL,
    "description"      TEXT         NOT NULL,
    "openedChannel"    VARCHAR(20)  NOT NULL,
    "openedByUserId"   INTEGER      NULL,
    "openedByPersonId" INTEGER      NULL,
    "reporterName"     VARCHAR(120) NULL,
    "reporterEmail"    VARCHAR(160) NULL,
    "assignedToUserId" INTEGER      NULL,
    "closedByUserId"   INTEGER      NULL,
    "closedAt"         TIMESTAMP    NULL,
    "createdAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
    "updatedAt"        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Constraints (idempotentes vía DO block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_shipmentId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_shipmentId"
            FOREIGN KEY ("shipmentId") REFERENCES "logitrack"."shipment" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_typeId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_typeId"
            FOREIGN KEY ("incidentTypeId") REFERENCES "logitrack"."incident_type" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_openedByUserId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_openedByUserId"
            FOREIGN KEY ("openedByUserId") REFERENCES "logitrack"."user" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_openedByPersonId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_openedByPersonId"
            FOREIGN KEY ("openedByPersonId") REFERENCES "logitrack"."person" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_assignedToUserId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_assignedToUserId"
            FOREIGN KEY ("assignedToUserId") REFERENCES "logitrack"."user" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_closedByUserId') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "fk_incident_closedByUserId"
            FOREIGN KEY ("closedByUserId") REFERENCES "logitrack"."user" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_status') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "chk_incident_status"
            CHECK ("status" IN ('OPEN','IN_REVIEW','CLOSED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_priority') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "chk_incident_priority"
            CHECK ("priority" BETWEEN 1 AND 4);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_resolution') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "chk_incident_resolution"
            CHECK ("resolution" IS NULL OR "resolution" IN ('PROCEDENTE','NO_PROCEDENTE'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_openedChannel') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "chk_incident_openedChannel"
            CHECK ("openedChannel" IN ('PORTAL','INTERNAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_closed_requires_resolution') THEN
        ALTER TABLE "logitrack"."incident"
            ADD CONSTRAINT "chk_incident_closed_requires_resolution"
            CHECK ("status" <> 'CLOSED' OR "resolution" IS NOT NULL);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_shipmentId"      ON "logitrack"."incident" ("shipmentId");
CREATE INDEX IF NOT EXISTS "idx_incident_status"          ON "logitrack"."incident" ("status");
CREATE INDEX IF NOT EXISTS "idx_incident_assignedToUserId" ON "logitrack"."incident" ("assignedToUserId");
CREATE INDEX IF NOT EXISTS "idx_incident_escalated_priority" ON "logitrack"."incident" ("escalated", "priority");

-- 3) Auditoria de incidencias
CREATE TABLE IF NOT EXISTS "logitrack"."incident_history" (
    "id"         SERIAL       PRIMARY KEY,
    "incidentId" INTEGER      NOT NULL,
    "eventType"  VARCHAR(30)  NOT NULL,
    "fromValue"  VARCHAR(60)  NULL,
    "toValue"    VARCHAR(60)  NULL,
    "comment"    TEXT         NULL,
    "userId"     INTEGER      NULL,
    "personId"   INTEGER      NULL,
    "changedAt"  TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_history_incidentId') THEN
        ALTER TABLE "logitrack"."incident_history"
            ADD CONSTRAINT "fk_incident_history_incidentId"
            FOREIGN KEY ("incidentId") REFERENCES "logitrack"."incident" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_history_userId') THEN
        ALTER TABLE "logitrack"."incident_history"
            ADD CONSTRAINT "fk_incident_history_userId"
            FOREIGN KEY ("userId") REFERENCES "logitrack"."user" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_history_personId') THEN
        ALTER TABLE "logitrack"."incident_history"
            ADD CONSTRAINT "fk_incident_history_personId"
            FOREIGN KEY ("personId") REFERENCES "logitrack"."person" ("id");
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_history_incidentId_changedAt"
    ON "logitrack"."incident_history" ("incidentId", "changedAt");
