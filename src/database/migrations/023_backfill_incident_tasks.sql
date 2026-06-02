-- Migration 023 - Backfill de checklist en incidencias existentes
-- Las incidencias creadas antes de la feature de checklist no tienen tareas.
-- Copia las plantillas activas del tipo a TODA incidencia (incl. cerradas) sin tareas.
-- En incidencias cerradas las tareas se marcan como hechas (done=true) para no
-- alterar su estado de resolución; solo sirven de registro visible.
-- Idempotente: solo inserta donde la incidencia aún no tiene ninguna tarea.
INSERT INTO "logitrack"."incident_task"
    ("incidentId", "templateId", "description", "required", "done", "ordering")
SELECT i."id", t."id", t."description", t."required",
       (i."status" = 'CLOSED') AS done,
       t."ordering"
FROM "logitrack"."incident" i
JOIN "logitrack"."incident_task_template" t
     ON t."incidentTypeId" = i."incidentTypeId"
    AND t."active" = true
WHERE NOT EXISTS (
        SELECT 1 FROM "logitrack"."incident_task" it
        WHERE it."incidentId" = i."id"
  );
