// Ojo de Patrón — notificación interna del bloqueo (US-5) y auditoría (US-14).
// Best-effort: nunca debe romper el flujo de bloqueo si falla.

async function audit(action, { actorId = null, checkId = null, detail = null } = {}) {
    try {
        const { FatigueAudit } = require('../../models/fatigueAudit');
        await FatigueAudit.create({ action, actorId, checkId, detail });
    } catch { /* best effort */ }
}

// Destinatarios internos: supervisores de la sucursal de origen + administradores.
// LGT-194 Esc.6: si la sucursal no tiene supervisores, la notificación queda
// cubierta por los administradores (fallback) y se registra el caso.
async function resolveRecipients(branchId) {
    try {
        const { Op } = require('sequelize');
        const { User } = require('../../models/user');
        const { RoleType } = require('../../constants/enums');
        const or = [{ roleId: RoleType.ADMIN.id }];
        if (branchId) { or.push({ roleId: RoleType.SUPERVISOR.id, branchId }); }
        const users = await User.findAll({ where: { [Op.or]: or }, attributes: ['id', 'email', 'fullName', 'roleId'] });
        if (branchId) {
            const supervisors = users.filter(u => u.roleId === RoleType.SUPERVISOR.id).length;
            if (supervisors === 0) {
                await audit('NOTIFY_FALLBACK_ADMIN', { detail: `Sucursal #${branchId} sin supervisores: notificación redirigida a administradores.` });
            }
        }
        return users.map(u => u.toJSON());
    } catch { return []; }
}

// LGT-194 — entrega por email (best-effort). Nunca rompe el flujo de bloqueo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function deliverEmail(recipients, subject, body) {
    try {
        const emails = recipients.map(r => r.email).filter(e => EMAIL_RE.test(String(e || '').trim()));
        if (!emails.length) { return 0; }
        const { sendEmail } = require('../notification/emailSender');
        await sendEmail(emails, subject, body, 'text');
        return emails.length;
    } catch { return 0; }
}

// Notifica el bloqueo por fatiga (in-app vía auditoría/panel + email). LGT-194.
async function notifyBlock({ check, branchId, transportName, routeId, score }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Ruta #${routeId} bloqueada por fatiga (score ${score}). ` +
        `Transportista: ${transportName || 'N/D'}. Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('NOTIFY_BLOCK', { checkId: check?.id, detail });
    const body = `Se bloqueó la ruta #${routeId} por fatiga.\n` +
        `Transportista: ${transportName || 'N/D'}\nScore: ${score}\n\n` +
        `Gestioná el caso en el panel: /fatigue`;
    const sent = await deliverEmail(recipients, `[LogiTrack] Bloqueo por fatiga — Ruta #${routeId}`, body);
    await audit('NOTIFY_BLOCK_EMAIL', { checkId: check?.id, detail: `Emails enviados: ${sent}` });
    return recipients.length;
}

// LGT-193 — aviso sin bloqueo: el control no se superó pero autoBlock está OFF, así que
// el conductor salió a ruta. Se notifica al Supervisor para decidir inhabilitar/reasignar.
async function notifyReview({ check, branchId, transportName, routeId, score }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Ruta #${routeId}: control de fatiga NO superado (score ${score}), pero el bloqueo automático está ` +
        `desactivado: el transportista ${transportName || 'N/D'} salió a ruta. Decidir inhabilitar o reasignar. ` +
        `Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('NOTIFY_REVIEW', { checkId: check?.id, detail });
    const body = `Aviso de fatiga SIN bloqueo automático.\nRuta #${routeId}\n` +
        `Transportista: ${transportName || 'N/D'}\nScore: ${score}\n\n` +
        `El conductor salió a ruta. Decidí si inhabilitarlo o reasignar la ruta en el panel: /fatigue`;
    const sent = await deliverEmail(recipients, `[LogiTrack] Aviso de fatiga sin bloqueo — Ruta #${routeId}`, body);
    await audit('NOTIFY_REVIEW_EMAIL', { checkId: check?.id, detail: `Emails enviados: ${sent}` });
    return recipients.length;
}

// LGT-199 Esc.4 — el conductor no completó el re-chequeo pedido en el tiempo límite:
// se avisa al supervisor para que decida (contactar, inhabilitar o reasignar).
async function notifyRecheckOmission({ check, branchId, transportName, routeId, minutes }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Ruta #${routeId}: el transportista ${transportName || 'N/D'} NO completó el re-chequeo de fatiga ` +
        `pedido en ruta (más de ${minutes} min sin hacerlo). Revisar: contactar, inhabilitar o reasignar. ` +
        `Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('NOTIFY_RECHECK_OMITTED', { checkId: check?.id, detail });
    const body = `Re-chequeo de fatiga NO realizado.\nRuta #${routeId}\n` +
        `Transportista: ${transportName || 'N/D'}\nSin completar la prueba hace más de ${minutes} min.\n\n` +
        `Gestioná el caso en el panel: /fatigue`;
    const sent = await deliverEmail(recipients, `[LogiTrack] Re-chequeo de fatiga sin realizar — Ruta #${routeId}`, body);
    await audit('NOTIFY_RECHECK_OMITTED_EMAIL', { checkId: check?.id, detail: `Emails enviados: ${sent}` });
    return recipients.length;
}

// LGT-195 — notifica al Supervisor (y admin) cuando el transportista queda inhabilitado
// por rechazar el consentimiento del control de fatiga (al alcanzar el límite parametrizado).
// El mail es parametrizable desde Ajustes → Comunicaciones (evento FATIGUE_DRIVER_DISABLED_CONSENT):
// se respeta el toggle on/off y la plantilla editable. Los destinatarios son fijos por la regla
// de negocio: Supervisores de la sucursal asignada al transportista + administradores.
async function notifyDriverDisabledByConsent({ driverId, driverName, branchId, branchName, routeId, rejections, max, reason }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Transportista ${driverName || '#' + driverId} inhabilitado por rechazo de consentimiento ` +
        `(${rejections}/${max}). Sucursal #${branchId || 'N/D'}. Notificados: ${recipients.length}.`;
    await audit('NOTIFY_DRIVER_DISABLED_CONSENT', { actorId: driverId, detail });

    // Respeta el toggle parametrizable desde Ajustes → Comunicaciones.
    let enabled = true;
    try {
        const { isNotificationEnabled } = require('../../models/notificationConfig');
        enabled = await isNotificationEnabled('FATIGUE_DRIVER_DISABLED_CONSENT');
    } catch { /* si falla, enviamos igual: seguridad por defecto. */ }
    if (!enabled) {
        await audit('NOTIFY_DRIVER_DISABLED_CONSENT_SKIPPED',
            { actorId: driverId, detail: 'Notificación deshabilitada desde Ajustes → Comunicaciones.' });
        return 0;
    }

    // Compone subject/body desde la plantilla editable; si no existe (migración no corrida)
    // usa texto por defecto. Render efímero — no se persiste contenido del email.
    const tplVars = {
        transportistaNombre: driverName || `#${driverId}`,
        transportistaId: driverId,
        sucursalNombre: branchName || (branchId ? `#${branchId}` : 'N/D'),
        sucursalId: branchId || '',
        rutaId: routeId || '',
        rechazos: rejections !== null && rejections !== undefined ? rejections : '',
        maxRechazos: max !== null && max !== undefined ? max : '',
        motivoInhabilitacion: reason || 'CONSENT_REJECTED',
    };
    let subject = `[LogiTrack] Transportista inhabilitado por fatiga — ${tplVars.transportistaNombre}`;
    let body = `Hola,\n\nEl transportista ${tplVars.transportistaNombre} (ID #${tplVars.transportistaId}) ` +
        `quedó inhabilitado tras rechazar el consentimiento ${tplVars.rechazos}/${tplVars.maxRechazos} vez/veces.\n` +
        `Sucursal: ${tplVars.sucursalNombre}\nRuta: #${tplVars.rutaId}\n\nGestionalo en: /fatigue`;
    let format = 'text';
    try {
        const emailTemplateModel = require('../../models/emailTemplate');
        const placeholders = require('../notificationPlaceholders');
        const tpl = await emailTemplateModel.getDefaultByEventCode('FATIGUE_DRIVER_DISABLED_CONSENT');
        if (tpl) {
            subject = placeholders.render(tpl.subject, tplVars) || subject;
            body    = placeholders.render(tpl.body, tplVars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn('[fatigue][notify] plantilla no disponible, uso texto por defecto:', err.message);
    }

    const sent = await deliverEmailFormat(recipients, subject, body, format);
    await audit('NOTIFY_DRIVER_DISABLED_CONSENT_EMAIL', { actorId: driverId, detail: `Emails enviados: ${sent}` });
    return sent;
}

// Variante de deliverEmail que respeta el formato (html / text) de la plantilla.
async function deliverEmailFormat(recipients, subject, body, format) {
    try {
        const emails = recipients.map(r => r.email).filter(e => EMAIL_RE.test(String(e || '').trim()));
        if (!emails.length) { return 0; }
        const { sendEmail } = require('../notification/emailSender');
        await sendEmail(emails, subject, body, format === 'html' ? 'html' : 'text');
        return emails.length;
    } catch { return 0; }
}

// LGT-197 — notifica al Supervisor (y admin) cuando se marca patrón recurrente.
async function notifyPattern({ userId, branchId, windowCount, windowDays }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Patrón de fatiga recurrente: transportista #${userId} con ${windowCount} bloqueos ` +
        `en ${windowDays} días. Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('PATTERN_RECURRENT', { actorId: userId, detail });
    const body = `Se detectó patrón de fatiga recurrente.\nTransportista: #${userId}\n` +
        `${windowCount} bloqueos en ${windowDays} días.\n\nRevisalo en el panel: /fatigue`;
    await deliverEmail(recipients, `[LogiTrack] Patrón de fatiga recurrente — Transportista #${userId}`, body);
    return recipients.length;
}

module.exports = {
    audit, resolveRecipients,
    notifyBlock, notifyReview, notifyRecheckOmission, notifyPattern,
    notifyDriverDisabledByConsent,
};
