-- Migration 022 - Sprint 4: Gestion E2E de incidencias
-- Agrega: checklist de tareas por tipo (plantillas + instancias), adjuntos,
-- canal SYSTEM (auto-generacion) y tipo DELIVERY_FAILED.
-- Idempotente: seguro de re-ejecutar.

-- =========================================================================
-- 0) Nuevo tipo de incidencia para auto-generacion por entrega fallida
-- =========================================================================
INSERT INTO "logitrack"."incident_type" ("code", "description") VALUES
    ('DELIVERY_FAILED', 'Entrega fallida')
ON CONFLICT ("code") DO NOTHING;

-- =========================================================================
-- 1) Relajar el CHECK de openedChannel para permitir 'SYSTEM'
-- =========================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_openedChannel') THEN
        ALTER TABLE "logitrack"."incident" DROP CONSTRAINT "chk_incident_openedChannel";
    END IF;
    ALTER TABLE "logitrack"."incident"
        ADD CONSTRAINT "chk_incident_openedChannel"
        CHECK ("openedChannel" IN ('PORTAL','INTERNAL','SYSTEM'));
END$$;

-- =========================================================================
-- 2) Plantillas de tareas (checklist) por tipo de incidencia
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."incident_task_template" (
    "id"             SERIAL       PRIMARY KEY,
    "incidentTypeId" INTEGER      NOT NULL,
    "description"    VARCHAR(200) NOT NULL,
    "ordering"       SMALLINT     NOT NULL DEFAULT 0,
    "required"       BOOLEAN      NOT NULL DEFAULT true,
    "active"         BOOLEAN      NOT NULL DEFAULT true
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_task_template_typeId') THEN
        ALTER TABLE "logitrack"."incident_task_template"
            ADD CONSTRAINT "fk_incident_task_template_typeId"
            FOREIGN KEY ("incidentTypeId") REFERENCES "logitrack"."incident_type" ("id") ON DELETE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_task_template_typeId"
    ON "logitrack"."incident_task_template" ("incidentTypeId");

-- =========================================================================
-- 3) Instancias de tareas por incidencia (snapshot del checklist)
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."incident_task" (
    "id"           SERIAL       PRIMARY KEY,
    "incidentId"   INTEGER      NOT NULL,
    "templateId"   INTEGER      NULL,
    "description"  VARCHAR(200) NOT NULL,
    "required"     BOOLEAN      NOT NULL DEFAULT true,
    "done"         BOOLEAN      NOT NULL DEFAULT false,
    "doneByUserId" INTEGER      NULL,
    "doneAt"       TIMESTAMP    NULL,
    "ordering"     SMALLINT     NOT NULL DEFAULT 0
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_task_incidentId') THEN
        ALTER TABLE "logitrack"."incident_task"
            ADD CONSTRAINT "fk_incident_task_incidentId"
            FOREIGN KEY ("incidentId") REFERENCES "logitrack"."incident" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_task_templateId') THEN
        ALTER TABLE "logitrack"."incident_task"
            ADD CONSTRAINT "fk_incident_task_templateId"
            FOREIGN KEY ("templateId") REFERENCES "logitrack"."incident_task_template" ("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_task_doneByUserId') THEN
        ALTER TABLE "logitrack"."incident_task"
            ADD CONSTRAINT "fk_incident_task_doneByUserId"
            FOREIGN KEY ("doneByUserId") REFERENCES "logitrack"."user" ("id");
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_task_incidentId"
    ON "logitrack"."incident_task" ("incidentId");

-- =========================================================================
-- 4) Adjuntos / evidencias de incidencia (base64 en TEXT)
-- =========================================================================
CREATE TABLE IF NOT EXISTS "logitrack"."incident_attachment" (
    "id"                 SERIAL       PRIMARY KEY,
    "incidentId"         INTEGER      NOT NULL,
    "fileName"           VARCHAR(200) NOT NULL,
    "mimeType"           VARCHAR(80)  NOT NULL,
    "dataBase64"         TEXT         NOT NULL,
    "source"             VARCHAR(20)  NOT NULL DEFAULT 'INTERNAL',
    "uploadedByUserId"   INTEGER      NULL,
    "uploadedByPersonId" INTEGER      NULL,
    "createdAt"          TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_attachment_incidentId') THEN
        ALTER TABLE "logitrack"."incident_attachment"
            ADD CONSTRAINT "fk_incident_attachment_incidentId"
            FOREIGN KEY ("incidentId") REFERENCES "logitrack"."incident" ("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_attachment_userId') THEN
        ALTER TABLE "logitrack"."incident_attachment"
            ADD CONSTRAINT "fk_incident_attachment_userId"
            FOREIGN KEY ("uploadedByUserId") REFERENCES "logitrack"."user" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_incident_attachment_personId') THEN
        ALTER TABLE "logitrack"."incident_attachment"
            ADD CONSTRAINT "fk_incident_attachment_personId"
            FOREIGN KEY ("uploadedByPersonId") REFERENCES "logitrack"."person" ("id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incident_attachment_source') THEN
        ALTER TABLE "logitrack"."incident_attachment"
            ADD CONSTRAINT "chk_incident_attachment_source"
            CHECK ("source" IN ('INTERNAL','PORTAL'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_incident_attachment_incidentId"
    ON "logitrack"."incident_attachment" ("incidentId");

-- =========================================================================
-- 5) Seed de plantillas de checklist por tipo de incidencia
--    Idempotente: solo inserta si no existe esa (tipo, descripcion).
-- =========================================================================
DO $$
DECLARE
    rec   RECORD;
    seeds JSONB := '[
        {"code":"PACKAGE_BROKEN", "tasks":["Verificar estado y fotos del paquete","Determinar responsabilidad del dano","Definir compensacion o reposicion","Notificar resolucion al cliente"]},
        {"code":"DELAY",          "tasks":["Revisar estado actual del envio","Contactar al transportista","Informar nueva fecha estimada al cliente"]},
        {"code":"MISSING_ITEM",   "tasks":["Cotejar contenido contra el remito","Buscar el item faltante en sucursal","Definir reposicion o reembolso"]},
        {"code":"WRONG_ADDRESS",  "tasks":["Contactar al destinatario","Confirmar la direccion correcta","Reprogramar la entrega"]},
        {"code":"LOST",           "tasks":["Iniciar busqueda del paquete","Revisar ultimo escaneo registrado","Definir reposicion o reembolso","Notificar resolucion al cliente"]},
        {"code":"DELIVERY_FAILED","tasks":["Revisar motivo del intento fallido","Contactar al destinatario","Coordinar reprogramacion o retiro en sucursal"]},
        {"code":"OTHER",          "tasks":["Analizar la situacion reportada","Definir y ejecutar accion correctiva"]}
    ]'::jsonb;
    item  JSONB;
    task  TEXT;
    ord   SMALLINT;
    typeId INTEGER;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(seeds)
    LOOP
        SELECT "id" INTO typeId FROM "logitrack"."incident_type" WHERE "code" = (item->>'code');
        IF typeId IS NULL THEN CONTINUE; END IF;
        ord := 0;
        FOR task IN SELECT * FROM jsonb_array_elements_text(item->'tasks')
        LOOP
            ord := ord + 1;
            IF NOT EXISTS (
                SELECT 1 FROM "logitrack"."incident_task_template"
                WHERE "incidentTypeId" = typeId AND "description" = task
            ) THEN
                INSERT INTO "logitrack"."incident_task_template"
                    ("incidentTypeId","description","ordering","required","active")
                VALUES (typeId, task, ord, true, true);
            END IF;
        END LOOP;
    END LOOP;
END$$;
