// Cancela automáticamente los envíos que quedaron en "Pendiente de Pago" sin que
// se confirme el cobro, pasado el plazo configurado en Ajustes (default 48hs).
// Avisa al cliente igual que cualquier otra cancelación.
const { Op } = require('sequelize');
const sequelize = require('../database/connection');
const { Shipment } = require('../models/shipment');
const shipmentModel = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const Setting = require('../models/setting');
const invoiceService = require('../services/invoiceService');
const { Status, NotificationEvent } = require('../constants/enums');

const DEFAULT_HOURS = 48;

const readThresholdHours = async () => {
    try {
        const raw = await Setting.get('horas_cancelacion_pago_pendiente');
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) { return n; }
    } catch { /* usa default */ }
    return DEFAULT_HOURS;
};

const processPendingPaymentExpirations = async () => {
    try {
        const hours = await readThresholdHours();
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

        const expired = await Shipment.findAll({
            where: { statusId: Status.PENDING_PAYMENT.id, createdAt: { [Op.lt]: cutoff } },
            attributes: ['id', 'trackingId', 'createdAt'],
        });

        // Si una nota de crédito ya anuló la factura (ej: el paquete se perdió antes
        // de pagarse), no tiene sentido cancelar "por falta de pago" — ya no hay nada
        // que cobrar. Se deja que el flujo de la incidencia/devolución decida el resto.
        const candidates = [];
        for (const shipment of expired) {
            const invoice = await invoiceService.getByShipment(shipment.id).catch(() => null);
            if (invoice && invoice.payStatus === 'ANULADA') { continue; }
            candidates.push(shipment);
        }

        if (!candidates.length) {
            console.log(`[pendingPaymentCancellationJob] Sin envíos vencidos (umbral ${hours}h).`);
            return;
        }

        const { notifyShipmentEvent } = require('../controllers/shipment');

        for (const shipment of candidates) {
            await sequelize.transaction(async (t) => {
                await shipmentHistoryModel.create({
                    shipmentId: shipment.id,
                    fromStatusId: Status.PENDING_PAYMENT.id,
                    toStatusId: Status.CANCELLED.id,
                    comment: `Cancelado automáticamente: pasaron ${hours}hs sin confirmarse el pago.`,
                    userId: null,
                    eventType: 'STATUS_CHANGE',
                    transaction: t,
                });
                await shipmentModel.updateStatus(shipment.id, Status.CANCELLED.id, { transaction: t });
            });
            await notifyShipmentEvent(NotificationEvent.SHIPMENT_CANCELLED, shipment.id)
                .catch(e => console.error('[pendingPaymentCancellationJob] notify:', e.message));
        }

        console.log(`[pendingPaymentCancellationJob] Cancelados ${candidates.length} envío(s) sin pagar (umbral ${hours}h).`);
    } catch (err) {
        console.error('[pendingPaymentCancellationJob] Error:', err.message);
    }
};

module.exports = { processPendingPaymentExpirations, readThresholdHours, DEFAULT_HOURS };
