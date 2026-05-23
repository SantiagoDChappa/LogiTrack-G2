const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const shipmentHistoryModel = require('../models/shipmentHistory');

const expireShipments = async () => {
    try {
        const settings = await settingModel.getAll();
        const diasExpiracion = parseInt(settings.dias_expiracion_envio) || 30;

        const shipments = await shipmentModel.getAll();
        const hoy = new Date();
        let expirados = 0;

        for (const shipment of shipments) {
            // Solo envíos en estado Pendiente (1)
            if (shipment.statusId !== 1) continue;

            const fechaCreacion = new Date(shipment.createdAt);
            const diasTranscurridos = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));

            if (diasTranscurridos >= diasExpiracion) {
                await shipmentModel.updateStatus(shipment.id, 10); // 10 = Expirado
                await shipmentHistoryModel.create({
                    shipmentId:   shipment.id,
                    fromStatusId: 1,
                    toStatusId:   10,
                    comment:      `Envío expirado automáticamente después de ${diasTranscurridos} días`,
                    userId:       null,
                    eventType:    'STATUS_CHANGE',
                });
                expirados++;
            }
        }

        console.log(`[Proceso automático] Envíos expirados: ${expirados}`);
        return expirados;
    } catch (err) {
        console.error('[Proceso automático] Error al expirar envíos:', err);
    }
};

module.exports = { expireShipments };