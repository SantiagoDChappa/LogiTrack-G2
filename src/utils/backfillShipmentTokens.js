// Sprint 3 - 4.1 / 3.2: backfill de delivery_secret_code y portal_token
// para shipments creados antes de la migration 018. Idempotente: sólo toca
// filas con NULL en las columnas correspondientes.
const { Shipment } = require('../models/shipment');
const { generateSecretCode, generatePortalToken } = require('./shipmentTokens');
const { Op } = require('sequelize');

const run = async () => {
    try {
        const rows = await Shipment.findAll({
            where: { [Op.or]: [{ deliverySecretCode: null }, { portalToken: null }] },
            attributes: ['id', 'deliverySecretCode', 'portalToken'],
        });
        for (const s of rows) {
            const patch = {};
            if (!s.deliverySecretCode) { patch.deliverySecretCode = generateSecretCode(); }
            if (!s.portalToken)        { patch.portalToken        = generatePortalToken(); }
            if (Object.keys(patch).length) {
                await Shipment.update(patch, { where: { id: s.id } });
            }
        }
        if (rows.length) { console.log(`[sprint3] backfill tokens: ${rows.length} shipments updated.`); }
    } catch (err) {
        // Migration aun no aplicada — error silencioso para no romper boot.
        if (!/column .* does not exist/i.test(err.message)) {
            console.error('backfillShipmentTokens:', err.message);
        }
    }
};

module.exports = { run };
