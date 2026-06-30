-- Backfill de "expectedDeliveryDate" para envíos legacy con valor NULL.
-- Estimación ficticia según el estado actual del envío. No pisa valores ya cargados.
--
-- Mapeo (días sumados a createdAt):
--   1 PENDING         → +5
--   2 IN_TRANSIT      → +3
--   3 AT_BRANCH       → +4
--   4 DELIVERED       → fecha real del history STATUS_CHANGE a 4, o createdAt+3 si no se encuentra
--   5 CANCELLED       → +5 (lo que debería haber sido)
--   6 ASSIGNED        → +3
--   7 IN_PREPARATION  → +5
--   8 PACKAGE_FAILED  → +5
--   9 FAILED_ATTEMPT  → +5

-- 1) DELIVERED: usar la fecha real del último cambio a estado 4 si existe.
UPDATE logitrack.shipment s
   SET "expectedDeliveryDate" = sub.changed_date
  FROM (
        SELECT "shipmentId", MAX("changedAt")::date AS changed_date
          FROM logitrack.shipment_history
         WHERE "toStatusId" = 4
         GROUP BY "shipmentId"
       ) sub
 WHERE s."id" = sub."shipmentId"
   AND s."statusId" = 4
   AND s."expectedDeliveryDate" IS NULL;

-- 2) Resto de estados (y DELIVERED sin history): fallback por estado.
UPDATE logitrack.shipment
   SET "expectedDeliveryDate" = (
        "createdAt"::date + (
            CASE "statusId"
                WHEN 1 THEN INTERVAL '5 day'
                WHEN 2 THEN INTERVAL '3 day'
                WHEN 3 THEN INTERVAL '4 day'
                WHEN 4 THEN INTERVAL '3 day'
                WHEN 5 THEN INTERVAL '5 day'
                WHEN 6 THEN INTERVAL '3 day'
                WHEN 7 THEN INTERVAL '5 day'
                WHEN 8 THEN INTERVAL '5 day'
                WHEN 9 THEN INTERVAL '5 day'
                ELSE       INTERVAL '5 day'
            END
        )
   )::date
 WHERE "expectedDeliveryDate" IS NULL;
