/**
 * Backfill de actualDays y wasDelayed en shipmentPrediction.
 *
 * Corrige los registros históricos donde actualDays fue calculado desde
 * el primer evento "En Tránsito" en vez de desde shipment.createdAt.
 * El fix en shipmentStateMachine.js ya cubre entregas futuras; este script
 * corrige los datos existentes.
 *
 * Uso: node src/data/backfill-actual-days.js
 */

const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');

async function run() {
    console.log('Iniciando backfill de actualDays...');

    const [rows] = await sequelize.query(
        `WITH primera_entrega AS (
            SELECT DISTINCT ON ("shipmentId") "shipmentId", "changedAt" AS delivered_at
            FROM logitrack.shipment_history
            WHERE "toStatusId" = 4
            ORDER BY "shipmentId", "changedAt" ASC
        ),
        nueva_prediccion AS (
            SELECT
                sp."shipmentId",
                sp.id AS pred_id,
                sp."predictedDays",
                GREATEST(1, CEIL(
                    EXTRACT(EPOCH FROM (pe.delivered_at - s."createdAt")) / 86400.0
                ))::int AS new_actual_days
            FROM logitrack."shipmentPrediction" sp
            JOIN logitrack.shipment s ON s.id = sp."shipmentId"
            JOIN primera_entrega pe ON pe."shipmentId" = sp."shipmentId"
            WHERE sp."actualDays" IS NOT NULL
        )
        UPDATE logitrack."shipmentPrediction" sp
        SET "actualDays" = np.new_actual_days,
            "wasDelayed" = np.new_actual_days > np."predictedDays"
        FROM nueva_prediccion np
        WHERE sp.id = np.pred_id
          AND sp."actualDays" IS DISTINCT FROM np.new_actual_days
        RETURNING sp."shipmentId"`,
        { type: QueryTypes.RAW }
    );

    const updated = Array.isArray(rows) ? rows.length : 0;
    console.log(`Backfill completado. Registros actualizados: ${updated}`);
    await sequelize.close();
}

run().catch(e => {
    console.error('Error en backfill:', e.message);
    process.exit(1);
});
