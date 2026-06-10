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

// Intervalo (en días) entre recordatorios mientras persiste la demora (LGT-160 Esc.4).
const DEFAULT_DELAY_REMINDER_DAYS = 1;

const readThresholdPct = async () => {
    try {
        const raw = await Setting.get('delay_threshold_pct');
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0 && n <= 100) { return n; }
    } catch { /* usa default */ }
    return DEFAULT_DELAY_THRESHOLD_PCT;
};

const readReminderDays = async () => {
    try {
        const raw = await Setting.get('delay_reminder_days');
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) { return n; }
    } catch { /* usa default */ }
    return DEFAULT_DELAY_REMINDER_DAYS;
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

// ¿Toca (re)notificar? Primera vez (delayNotifiedAt null) o pasó el intervalo de
// recordatorio desde el último aviso (LGT-160 Esc.4). delayNotifiedAt = último envío.
const shouldNotify = (shipment, now, reminderDays) => {
    if (!shipment.delayNotifiedAt) { return true; }
    const last = new Date(shipment.delayNotifiedAt);
    return (now - last) >= reminderDays * 86400000;
};

const processDelayedShipments = async () => {
    try {
        const now = new Date();
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const pct = await readThresholdPct();
        const reminderDays = await readReminderDays();

        // Candidatos: ya vencidos (expected < hoy) y no terminales. Incluye los ya
        // notificados para poder reenviar recordatorios mientras persista la demora.
        const candidates = await Shipment.findAll({
            where: {
                expectedDeliveryDate: { [Op.lt]: today },
                statusId: { [Op.notIn]: TERMINAL_STATUS_IDS },
            },
            attributes: ['id', 'trackingId', 'createdAt', 'expectedDeliveryDate', 'delayNotifiedAt'],
        });

        const toNotify = candidates.filter(s =>
            isSignificantlyDelayed(s, today, pct) && shouldNotify(s, now, reminderDays));

        if (!toNotify.length) {
            console.log(`[delayDetectionJob] Sin avisos pendientes (umbral ${pct}%, recordatorio ${reminderDays}d).`);
            return;
        }

        const { notifyShipmentEvent } = require('../controllers/shipment');
        let firstTime = 0, reminders = 0;

        for (const shipment of toNotify) {
            if (shipment.delayNotifiedAt) { reminders++; } else { firstTime++; }
            await notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, shipment.id);
            await shipment.update({ delayNotifiedAt: new Date() });
        }

        await processRecoveries(today, pct);

        console.log(`[delayDetectionJob] Avisos de demora: ${firstTime} nuevos + ${reminders} recordatorios (umbral ${pct}%).`);
    } catch (err) {
        console.error('[delayDetectionJob] Error:', err.message);
    }
};

// LGT-160 Esc.6 — recuperación: envíos ya notificados que dejaron de estar en
// demora significativa (p. ej. se reprogramó el ETA) → avisar y limpiar la marca.
const processRecoveries = async (today, pct) => {
    const candidates = await Shipment.findAll({
        where: {
            delayNotifiedAt: { [Op.ne]: null },
            statusId: { [Op.notIn]: TERMINAL_STATUS_IDS },
        },
        attributes: ['id', 'trackingId', 'createdAt', 'expectedDeliveryDate', 'delayNotifiedAt'],
    });
    const recovered = candidates.filter(s => !isSignificantlyDelayed(s, today, pct));
    if (!recovered.length) { return; }

    const { notifyShipmentEvent } = require('../controllers/shipment');
    for (const shipment of recovered) {
        await notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAY_RECOVERED, shipment.id);
        await shipment.update({ delayNotifiedAt: null });
    }
    console.log(`[delayDetectionJob] Recuperaciones notificadas: ${recovered.length}.`);
};

module.exports = {
    processDelayedShipments, processRecoveries, isSignificantlyDelayed, shouldNotify,
    readThresholdPct, readReminderDays,
    DEFAULT_DELAY_THRESHOLD_PCT, DEFAULT_DELAY_REMINDER_DAYS,
};
