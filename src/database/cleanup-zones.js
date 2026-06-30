/* eslint-disable no-console */
// Analiza y limpia zonas duplicadas + transport_zone
// Uso:
//   node src/database/cleanup-zones.js          → solo analiza (dry-run)
//   node src/database/cleanup-zones.js --apply  → aplica limpieza

require('dotenv').config();
const sequelize = require('./connection');
const { QueryTypes } = require('sequelize');

const APPLY = process.argv.includes('--apply');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Conectado a DB\n');

        // 1. Analizar duplicados
        const dupes = await sequelize.query(
            `SELECT name, province_id, COUNT(*) as cnt, MIN(id) as keep_id,
                    array_agg(id ORDER BY id) as all_ids
             FROM logitrack.zone
             GROUP BY name, province_id
             HAVING COUNT(*) > 1
             ORDER BY COUNT(*) DESC, name`,
            { type: QueryTypes.SELECT }
        );

        const totalZones = await sequelize.query(
            'SELECT COUNT(*) as cnt FROM logitrack.zone',
            { type: QueryTypes.SELECT }
        );
        console.log(`Total zonas: ${totalZones[0].cnt}`);
        console.log(`Grupos con duplicados: ${dupes.length}`);

        let totalDupeRows = 0;
        dupes.forEach(d => {
            const dupeCount = parseInt(d.cnt) - 1;
            totalDupeRows += dupeCount;
            console.log(`  ${d.name} (prov=${d.province_id}): ${d.cnt} copias, keep id=${d.keep_id}, borrar ${dupeCount}`);
        });
        console.log(`\nTotal filas duplicadas a eliminar: ${totalDupeRows}`);
        console.log(`Zonas unicas que quedarian: ${parseInt(totalZones[0].cnt) - totalDupeRows}`);

        // 2. Analizar referencias FK
        // shipment table uses camelCase columns ("zoneId")
        const shipmentRefs = await sequelize.query(
            `SELECT DISTINCT s."zoneId" as zone_id FROM logitrack.shipment s WHERE s."zoneId" IS NOT NULL ORDER BY 1`,
            { type: QueryTypes.SELECT }
        );
        console.log(`\nZone IDs referenciados por shipments: ${shipmentRefs.map(r => r.zone_id).join(', ')}`);

        // transport_zone uses snake_case columns (zone_id, transport_id)
        const tzRefs = await sequelize.query(
            `SELECT DISTINCT tz.zone_id FROM logitrack.transport_zone tz ORDER BY 1`,
            { type: QueryTypes.SELECT }
        );
        console.log(`Zone IDs referenciados por transport_zone: ${tzRefs.length} distintos`);

        const transports = await sequelize.query(
            'SELECT COUNT(*) as cnt FROM logitrack.transport',
            { type: QueryTypes.SELECT }
        );
        console.log(`Total transportes: ${transports[0].cnt}`);

        const tzTotal = await sequelize.query(
            'SELECT COUNT(*) as cnt FROM logitrack.transport_zone',
            { type: QueryTypes.SELECT }
        );
        console.log(`Total transport_zone rows: ${tzTotal[0].cnt}`);

        // TransportZone duplicados logicos
        const tzDupes = await sequelize.query(
            `SELECT tz.transport_id, z.name, z.province_id, COUNT(*) as cnt
             FROM logitrack.transport_zone tz
             JOIN logitrack.zone z ON z.id = tz.zone_id
             GROUP BY tz.transport_id, z.name, z.province_id
             HAVING COUNT(*) > 1
             ORDER BY cnt DESC`,
            { type: QueryTypes.SELECT }
        );
        console.log(`\nTransport_zone con duplicados logicos (mismo transport + misma zona por nombre): ${tzDupes.length}`);

        if (!APPLY) {
            console.log('\n=== DRY RUN — usar --apply para ejecutar limpieza ===');
            await sequelize.close();
            return;
        }

        // ============ APPLY CLEANUP ============
        console.log('\n=== APLICANDO LIMPIEZA ===\n');

        const t = await sequelize.transaction();

        try {
            for (const dupe of dupes) {
                const keepId = dupe.keep_id;
                const allIds = dupe.all_ids;
                const deleteIds = allIds.filter(id => id !== keepId);

                if (deleteIds.length === 0) continue;

                // Reasignar shipments al id que se mantiene (camelCase column)
                await sequelize.query(
                    `UPDATE logitrack.shipment SET "zoneId" = :keepId WHERE "zoneId" IN (:deleteIds)`,
                    { replacements: { keepId, deleteIds }, transaction: t }
                );

                // transport_zone: asegurar keepId existe para cada transport afectado
                await sequelize.query(
                    `INSERT INTO logitrack.transport_zone (transport_id, zone_id)
                     SELECT DISTINCT tz.transport_id, :keepId
                     FROM logitrack.transport_zone tz
                     WHERE tz.zone_id IN (:deleteIds)
                       AND NOT EXISTS (
                         SELECT 1 FROM logitrack.transport_zone tz2
                         WHERE tz2.transport_id = tz.transport_id AND tz2.zone_id = :keepId
                       )`,
                    { replacements: { keepId, deleteIds }, transaction: t }
                );

                // Borrar transport_zone con ids duplicados
                await sequelize.query(
                    `DELETE FROM logitrack.transport_zone WHERE zone_id IN (:deleteIds)`,
                    { replacements: { deleteIds }, transaction: t }
                );

                // Borrar zonas duplicadas
                await sequelize.query(
                    `DELETE FROM logitrack.zone WHERE id IN (:deleteIds)`,
                    { replacements: { deleteIds }, transaction: t }
                );

                console.log(`  ${dupe.name} (prov=${dupe.province_id}): eliminadas ${deleteIds.length} copias, mantenido id=${keepId}`);
            }

            await t.commit();
            console.log('\nCommit OK.');

            // Resultado final
            const finalZones = await sequelize.query(
                'SELECT COUNT(*) as cnt FROM logitrack.zone',
                { type: QueryTypes.SELECT }
            );
            const finalTz = await sequelize.query(
                'SELECT COUNT(*) as cnt FROM logitrack.transport_zone',
                { type: QueryTypes.SELECT }
            );
            console.log(`\nResultado final:`);
            console.log(`  Zonas: ${totalZones[0].cnt} -> ${finalZones[0].cnt}`);
            console.log(`  Transport_zone: ${tzTotal[0].cnt} -> ${finalTz[0].cnt}`);

            // Listar zonas finales
            const finalList = await sequelize.query(
                'SELECT id, name, province_id, base_cost, enabled FROM logitrack.zone ORDER BY name, id',
                { type: QueryTypes.SELECT }
            );
            console.log(`\nZonas finales:`);
            finalList.forEach(z => console.log(`  id=${z.id} | ${z.name} | prov=${z.province_id} | cost=${z.base_cost} | enabled=${z.enabled}`));

        } catch (err) {
            await t.rollback();
            throw err;
        }

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
