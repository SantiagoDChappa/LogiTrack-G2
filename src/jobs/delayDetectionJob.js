const { Op } = require('sequelize');
const { Shipment } = require('../models/shipment');
const Setting = require('../models/setting');
const { Status, NotificationEvent } = require('../constants/enums');

const TERMINAL_STATUS_IDS = [
    Status.DELIVERED.id,
    Status.CANCELLED.id,
    Status.PACKAGE_FAILED.id,
];

// LGT-160: el umbral de "demora significativa" es un PORCENTAJE de la duración
// total estimada del viaje, no una cantidad fija de horas. Esto hace que el
// umbral escale con la duración: 6 días sobre 60 son 10%, sobre 120 son 5%.
const DEFAULT_DELAY_THRESHOLD_PCT = 15;

const readThresholdPct = async () => {
    try {
        const raw = await Setting.get('delay_threshold_pct');
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0 && n <= 100) { return n; }
    } catch { /* usa default */ }
    return DEFAULT_DELAY_THRESHOLD_PCT;
};

// Días enteros entre dos fechas (truncadas a día).
const daysBetween = (from, to) => {
    const a = new Date(from); a.setHours(0, 0, 0, 0);
    const b = new Date(to);   b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
};

// ¿El envío superó el umbral de demora (% de la duración estimada del viaje)?
// duración = expectedDeliveryDate - createdAt (mínimo 1 día).
// demora permitida = ceil(duración * pct/100). Dispara si hoy supera ese margen.
const isSignificantlyDelayed = (shipment, today, pct) => {
    if (!shipment.expectedDeliveryDate || !shipment.createdAt) { return false; }
    const spanDays = Math.max(1, daysBetween(shipment.createdAt, shipment.expectedDeliveryDate));
    const allowedDelayDays = Math.ceil((spanDays * pct) / 100);
    const overdueDays = daysBetween(shipment.expectedDeliveryDate, today);
    return overdueDays > allowedDelayDays;
};

const processDelayedShipments = async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pct = await readThresholdPct();

        // Candidatos: ya vencidos (expected < hoy), no terminales y sin notificar.
        // El filtro fino por % se aplica en JS porque depende de la duración de cada envío.
        const candidates = await Shipment.findAll({
            where: {
                expectedDeliveryDate: { [Op.lt]: today },
                statusId: { [Op.notIn]: TERMINAL_STATUS_IDS },
                delayNotifiedAt: null,
            },
            attributes: ['id', 'trackingId', 'createdAt', 'expectedDeliveryDate', 'delayNotifiedAt'],
        });

        const overdue = candidates.filter(s => isSignificantlyDelayed(s, today, pct));

        if (!overdue.length) {
            console.log(`[delayDetectionJob] Sin demoras significativas (umbral ${pct}% de la duración).`);
            return;
        }

        const { notifyShipmentEvent } = require('../controllers/shipment');

        for (const shipment of overdue) {
            await notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, shipment.id);
            await shipment.update({ delayNotifiedAt: new Date() });
        }

        console.log(`[delayDetectionJob] Notificaciones de demora enviadas: ${overdue.length} (umbral ${pct}%).`);
    } catch (err) {
        console.error('[delayDetectionJob] Error:', err.message);
    }
};

module.exports = { processDelayedShipments, isSignificantlyDelayed, readThresholdPct, DEFAULT_DELAY_THRESHOLD_PCT };
