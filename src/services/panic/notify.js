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

        // 2) Email HTML con estilo (mismo canal que las demás notificaciones).
        const subject = `[LogiTrack] 🚨 SOS — ${ctx.driverName}`;
        const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        const row = (label, val) => `<tr><td style="padding:5px 14px 5px 0;color:#64748b;white-space:nowrap">${label}</td>`
            + `<td style="padding:5px 0;color:#0f172a;font-weight:600">${val}</td></tr>`;
        const ubicHtml = hasLoc ? `<a href="${mapUrl}" style="color:#dc2626">Abrir en el mapa</a>` : 'No disponible';
        const mapBtn = hasLoc
            ? `<a href="${mapUrl}" style="display:inline-block;margin-top:18px;background:#dc2626;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:700">Ver ubicación en el mapa</a>`
            : '';
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">`
            + `<div style="background:#dc2626;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:bold">🚨 Alerta de emergencia (SOS)</div>`
            + `<div style="padding:20px">`
            + `<p style="margin:0 0 14px;font-size:16px;color:#0f172a"><b>${esc(ctx.driverName)}</b> activó una alerta de emergencia.</p>`
            + `<table style="border-collapse:collapse;font-size:14px">`
            + row('Ruta', routeId ? `#${esc(routeId)}` : 'Sin ruta asignada')
            + row('Sucursal', esc(sucursal))
            + row('Fecha y hora', esc(hora))
            + row('Ubicación', ubicHtml)
            + `</table>${mapBtn}`
            + `<p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.5">Aviso automático de LogiTrack. Si es una emergencia con riesgo de vida, llamá también a emergencias (911).</p>`
            + `</div></div>`;
        const emails = await fatigueNotify.deliverEmailFormat(recipients, subject, html, 'html');

        return { notified: created, emails, recipients: recipients.length, driverName: ctx.driverName };
    } catch (e) {
        console.error('[panic][notify]', e.message);
        return { notified: 0, emails: 0, recipients: 0, error: true };
    }
}

module.exports = { notifyPanic };
