-- Backfill de actualDays/wasDelayed para envíos ya entregados.
-- Calcula los días reales desde el primer evento EN_TRÁNSITO hasta el evento ENTREGADO
-- usando el historial de estados. Solo actualiza filas donde actualDays es NULL.
UPDATE logitrack."shipmentPrediction" sp
SET
    "actualDays" = GREATEST(1, CEIL(
        EXTRACT(EPOCH FROM (h_end."changedAt" - h_start."changedAt")) / 86400
    )::int),
    "wasDelayed" = CEIL(
        EXTRACT(EPOCH FROM (h_end."changedAt" - h_start."changedAt")) / 86400
    ) > sp."predictedDays"
FROM (
    SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt"
    FROM logitrack.shipment_history
    WHERE "toStatusId" = 2
    ORDER BY "shipmentId", "changedAt" ASC
) h_start
JOIN (
    SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt"
    FROM logitrack.shipment_history
    WHERE "toStatusId" = 4
    ORDER BY "shipmentId", "changedAt" ASC
) h_end ON h_end."shipmentId" = h_start."shipmentId"
WHERE sp."shipmentId" = h_start."shipmentId"
  AND sp."actualDays" IS NULL;
