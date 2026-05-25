-- 021_backfill_shipment_current_branch.sql
-- Backfill: envios ruteables sin currentBranchId -> asignar sucursal mas cercana al destino (haversine).
-- Estados ruteables: PENDING (1), AT_BRANCH (3), IN_PREPARATION (7).
-- Casos cubiertos:
--   a) envio con pickupBranchId asignado -> usar esa sucursal directamente
--   b) envio con direccion geolocalizada -> sucursal abierta mas cercana
--   c) envio sin coords -> queda en NULL (no se puede inferir)

SET search_path TO "logitrack";

-- a) pickup en sucursal: el currentBranch es la pickupBranch
UPDATE "shipment" s
SET "currentBranchId" = s."pickup_branch_id"
WHERE s."currentBranchId" IS NULL
  AND s."pickup_branch_id" IS NOT NULL
  AND s."statusId" IN (1, 3, 7);

-- b) door delivery: sucursal abierta mas cercana al destino (haversine)
UPDATE "shipment" s
SET "currentBranchId" = sub.branch_id
FROM (
    SELECT DISTINCT ON (s2.id) s2.id AS shipment_id, b.id AS branch_id
    FROM "shipment" s2
    JOIN "address" a ON a.id = s2."addressId"
    JOIN "branch"  b ON b.closed = FALSE
                    AND b.latitude  IS NOT NULL
                    AND b.longitude IS NOT NULL
    WHERE s2."currentBranchId" IS NULL
      AND s2."statusId" IN (1, 3, 7)
      AND a.lat IS NOT NULL
      AND a.lng IS NOT NULL
    ORDER BY s2.id,
        2 * 6371 * asin(sqrt(
            power(sin(radians((b.latitude::float8 - a.lat) / 2)), 2) +
            cos(radians(a.lat)) * cos(radians(b.latitude::float8)) *
            power(sin(radians((b.longitude::float8 - a.lng) / 2)), 2)
        )) ASC
) sub
WHERE s.id = sub.shipment_id;
