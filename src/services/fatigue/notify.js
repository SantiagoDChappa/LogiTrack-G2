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

// Notifica el bloqueo por fatiga. Devuelve la cantidad de destinatarios resueltos.
async function notifyBlock({ check, branchId, transportName, routeId, score }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Ruta #${routeId} bloqueada por fatiga (score ${score}). ` +
        `Transportista: ${transportName || 'N/D'}. Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('NOTIFY_BLOCK', { checkId: check?.id, detail });
    // Best-effort: integración con el pipeline de notificaciones internas/email.
    // Se deja como gancho; el panel de supervisor (US-6) es la superficie principal.
    return recipients.length;
}

// LGT-197 — notifica al Supervisor (y admin) cuando se marca patrón recurrente.
async function notifyPattern({ userId, branchId, windowCount, windowDays }) {
    const recipients = await resolveRecipients(branchId);
    const detail = `Patrón de fatiga recurrente: transportista #${userId} con ${windowCount} bloqueos ` +
        `en ${windowDays} días. Notificados: ${recipients.length} (supervisores + admin).`;
    await audit('PATTERN_RECURRENT', { actorId: userId, detail });
    return recipients.length;
}

module.exports = { audit, resolveRecipients, notifyBlock, notifyPattern };
