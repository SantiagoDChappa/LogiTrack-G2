// Ojo de Patrón — notificación interna del bloqueo (US-5) y auditoría (US-14).
// Best-effort: nunca debe romper el flujo de bloqueo si falla.

async function audit(action, { actorId = null, checkId = null, detail = null } = {}) {
    try {
        const { FatigueAudit } = require('../../models/fatigueAudit');
        await FatigueAudit.create({ action, actorId, checkId, detail });
    } catch { /* best effort */ }
}

// Destinatarios internos: supervisores de la sucursal de origen + administradores.
async function resolveRecipients(branchId) {
    try {
        const { Op } = require('sequelize');
        const { User } = require('../../models/user');
        const { RoleType } = require('../../constants/enums');
        const or = [{ roleId: RoleType.ADMIN.id }];
        if (branchId) { or.push({ roleId: RoleType.SUPERVISOR.id, branchId }); }
        const users = await User.findAll({ where: { [Op.or]: or }, attributes: ['id', 'email', 'fullName'] });
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

module.exports = { audit, resolveRecipients, notifyBlock, notifyPattern };
