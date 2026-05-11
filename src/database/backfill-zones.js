const sequelize = require('./connection');
const { Shipment } = require('../models/shipment');
const { Address } = require('../models/address');
const { resolveZone, invalidateCache } = require('../services/zoneResolver.service');

(async () => {
    try {
        invalidateCache();
        const pending = await Shipment.findAll({
            where: { zoneId: null },
            include: [{ model: Address, as: 'address', required: false }],
        });
        console.log(`Envíos sin zona: ${pending.length}`);
        let updated = 0;
        for (const s of pending) {
            const zone = await resolveZone({
                postalCode: s.address?.postalCode,
                provinceId: s.address?.provinceId,
            });
            if (zone) {
                await s.update({ zoneId: zone.id });
                updated++;
                console.log(`  ${s.trackingId} → zona ${zone.name} (id=${zone.id})`);
            } else {
                console.log(`  ${s.trackingId} → sin zona aplicable (CP=${s.address?.postalCode}, prov=${s.address?.provinceId})`);
            }
        }
        console.log(`Actualizados: ${updated}/${pending.length}`);
        await sequelize.close();
        process.exit(0);
    } catch (err) {
        console.error('ERROR backfill-zones:', err);
        process.exit(1);
    }
})();
