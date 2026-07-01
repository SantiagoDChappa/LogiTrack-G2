// SOS / Pánico — aviso interno cuando un repartidor activa la alerta de emergencia.
// Reusa el CRITERIO de fatiga para destinatarios (supervisores de la sucursal del
// conductor + administradores) y su envío de email; suma la notificación in-app.
// Best-effort: nunca debe romper el POST /panic (una falla de aviso no puede tumbar el SOS).
const inApp = require('../notification/inAppNotifier');
const fatigueNotify = require('../fatigue/notify');

async function notifyPanic({ userId, routeId = null, latitude = null, longitude = null, at = null }) {
    try {
        // Mismo criterio que fatiga: sucursal ASIGNADA al conductor → sus supervisores + admins.
        const ctx = await fatigueNotify.resolveDriverContext(userId, null);
        const recipients = await fatigueNotify.resolveRecipients(ctx.branchId);
        if (!recipients.length) { return { notified: 0, emails: 0, recipients: 0 }; }

        const when = at ? new Date(at) : new Date();
        const hora = when.toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
        const hasLoc = latitude != null && longitude != null;
        const mapUrl = hasLoc ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;
        const ubicLine = hasLoc ? `Ubicación: ${mapUrl}` : 'Ubicación: no disponible';
        const rutaLine = routeId ? `Ruta #${routeId}` : 'Sin ruta asignada';
        const sucursal = ctx.branchName || (ctx.branchId ? `#${ctx.branchId}` : 'N/D');

        const title = `🚨 SOS de ${ctx.driverName}`;
        const body = `${ctx.driverName} activó una alerta de emergencia.\n`
            + `${rutaLine} · Sucursal: ${sucursal} · ${hora}\n${ubicLine}`;

        // 1) In-app (campana) para cada supervisor/admin.
        const created = await inApp.notifyMany(recipients.map((r) => r.id), {
            event: 'PANIC_ALERT', title, body,
            resourceType: 'route', resourceId: routeId || null, url: mapUrl,
        });

        // 2) Email (reusa el envío deduplicado de fatiga).
        const subject = `[LogiTrack] 🚨 SOS — ${ctx.driverName}`;
        const emails = await fatigueNotify.deliverEmail(recipients, subject, body);

        return { notified: created, emails, recipients: recipients.length, driverName: ctx.driverName };
    } catch (e) {
        console.error('[panic][notify]', e.message);
        return { notified: 0, emails: 0, recipients: 0, error: true };
    }
}

module.exports = { notifyPanic };
