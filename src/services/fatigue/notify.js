// Ojo de Patrón — notificaciones internas de fatiga (US-5 / US-13 / US-14).
// Best-effort: nunca debe romper el flujo de bloqueo si falla.
// Todos los avisos van a los Supervisores de la sucursal ASIGNADA AL TRANSPORTISTA
// (fallback: sucursal del contexto/ruta) + administradores, y usan una plantilla
// editable desde Ajustes → Comunicaciones (toggle on/off + subject/body con tokens).

async function audit(action, { actorId = null, checkId = null, detail = null } = {}) {
    try {
        const { FatigueAudit } = require('../../models/fatigueAudit');
        await FatigueAudit.create({ action, actorId, checkId, detail });
    } catch { /* best effort */ }
}

// Destinatarios internos: supervisores de la sucursal indicada + administradores.
// LGT-194 Esc.6: si la sucursal no tiene supervisores, queda cubierto por los admins.
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

// Resuelve el contexto del transportista para los avisos: nombre, sucursal ASIGNADA
// (user.branchId) y su nombre. Si el conductor no tiene sucursal, cae al branchId del
// contexto (ruta). Decisión de negocio: avisar a la sucursal del transportista.
async function resolveDriverContext(userId, fallbackBranchId) {
    let driverName = userId ? `#${userId}` : 'N/D';
    let branchId = fallbackBranchId || null;
    let branchName = '';
    try {
        const { User } = require('../../models/user');
        const u = userId ? await User.findByPk(userId, { attributes: ['fullName', 'branchId'] }) : null;
        if (u) {
            driverName = u.fullName || driverName;
            if (u.branchId) { branchId = u.branchId; }
        }
        if (branchId) {
            const { Branch } = require('../../models/branch');
            const b = await Branch.findByPk(branchId, { attributes: ['name'] });
            if (b) { branchName = b.name; }
        }
    } catch (err) {
        console.warn('[fatigue][notify] no se pudo resolver driver/branch:', err.message);
    }
    return { driverName, branchId, branchName };
}

// LGT-194 — entrega por email (best-effort). Nunca rompe el flujo de bloqueo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function deliverEmail(recipients, subject, body) {
    return deliverEmailFormat(recipients, subject, body, 'text');
}

// Variante que respeta el formato (html / text) de la plantilla.
async function deliverEmailFormat(recipients, subject, body, format) {
    try {
        // Deduplicar (case-insensitive): SendGrid rechaza con 400 si una misma
        // dirección aparece repetida en el campo `to`.
        const seen = new Set();
        const emails = [];
        for (const r of recipients) {
            const e = String(r.email || '').trim();
            if (!EMAIL_RE.test(e)) { continue; }
            const key = e.toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key);
            emails.push(e);
        }
        if (!emails.length) { return 0; }
        const { sendEmail } = require('../notification/emailSender');
        await sendEmail(emails, subject, body, format === 'html' ? 'html' : 'text');
        return emails.length;
    } catch { return 0; }
}

// ¿Está habilitado el evento en Ajustes → Comunicaciones? Si NO existe la config
// (migración aún no corrida), enviamos igual: seguridad por defecto para fatiga.
async function fatigueNotifEnabled(eventCode) {
    try {
        const { getConfigByEvent } = require('../../models/notificationConfig');
        const cfg = await getConfigByEvent(eventCode);
        return cfg ? cfg.enabled : true;
    } catch { return true; }
}

// Render + envío genérico de un aviso de fatiga con plantilla editable. Devuelve
// la cantidad de mails enviados. Respeta el toggle y cae a subject/body por defecto
// si la plantilla no existe.
async function sendTemplated({ eventCode, branchId, defaultSubject, defaultBody, vars, auditAction, auditDetail, checkId = null, actorId = null }) {
    const recipients = await resolveRecipients(branchId);
    await audit(auditAction, { checkId, actorId, detail: auditDetail(recipients.length) });

    if (!(await fatigueNotifEnabled(eventCode))) {
        await audit(`${auditAction}_SKIPPED`, { checkId, actorId, detail: 'Notificación deshabilitada desde Ajustes → Comunicaciones.' });
        return 0;
    }

    // Link absoluto al panel de Ojo de Patrón para los CTA (las plantillas HTML lo usan).
    try {
        const ph = require('../notificationPlaceholders');
        if (!vars.panelUrl) { vars.panelUrl = `${ph.baseUrl()}/fatigue`; }
    } catch { /* sin baseUrl: el token queda vacío */ }

    let subject = defaultSubject;
    let body = defaultBody;
    let format = 'text';
    try {
        const emailTemplateModel = require('../../models/emailTemplate');
        const placeholders = require('../notificationPlaceholders');
        const tpl = await emailTemplateModel.getDefaultByEventCode(eventCode);
        if (tpl) {
            subject = placeholders.render(tpl.subject, vars) || subject;
            body    = placeholders.render(tpl.body, vars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn(`[fatigue][notify] plantilla ${eventCode} no disponible, uso texto por defecto:`, err.message);
    }

    const sent = await deliverEmailFormat(recipients, subject, body, format);
    await audit(`${auditAction}_EMAIL`, { checkId, actorId, detail: `Emails enviados: ${sent}` });
    return sent;
}

const branchLabel = (ctx) => ctx.branchName || (ctx.branchId ? `#${ctx.branchId}` : 'N/D');

// LGT-194 — ruta bloqueada por no superar el control de fatiga.
async function notifyBlock({ check, branchId, routeId, score }) {
    const ctx = await resolveDriverContext(check?.userId, branchId);
    const vars = {
        transportistaNombre: ctx.driverName, transportistaId: check?.userId ?? '',
        sucursalNombre: branchLabel(ctx), sucursalId: ctx.branchId ?? '',
        rutaId: routeId ?? '', score: score ?? '',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_ROUTE_BLOCKED', branchId: ctx.branchId, checkId: check?.id,
        defaultSubject: `[LogiTrack] Ruta #${routeId} bloqueada por fatiga — ${ctx.driverName}`,
        defaultBody: `Se bloqueó la ruta #${routeId} por fatiga.\nTransportista: ${ctx.driverName}\nSucursal: ${branchLabel(ctx)}\nScore: ${score}\n\nGestioná el caso en el panel: /fatigue`,
        vars, auditAction: 'NOTIFY_BLOCK',
        auditDetail: (n) => `Ruta #${routeId} bloqueada por fatiga (score ${score}). Transportista: ${ctx.driverName}. Notificados: ${n}.`,
    });
}

// LGT-193 — no apto pero autoBlock OFF: el conductor salió igual, el supervisor revisa.
async function notifyReview({ check, branchId, routeId, score }) {
    const ctx = await resolveDriverContext(check?.userId, branchId);
    const vars = {
        transportistaNombre: ctx.driverName, transportistaId: check?.userId ?? '',
        sucursalNombre: branchLabel(ctx), sucursalId: ctx.branchId ?? '',
        rutaId: routeId ?? '', score: score ?? '',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_REVIEW_NO_BLOCK', branchId: ctx.branchId, checkId: check?.id,
        defaultSubject: `[LogiTrack] Aviso de fatiga sin bloqueo — Ruta #${routeId}`,
        defaultBody: `Aviso de fatiga SIN bloqueo automático.\nRuta #${routeId}\nTransportista: ${ctx.driverName}\nSucursal: ${branchLabel(ctx)}\nScore: ${score}\n\nEl conductor salió a ruta. Decidí inhabilitar o reasignar en: /fatigue`,
        vars, auditAction: 'NOTIFY_REVIEW',
        auditDetail: (n) => `Ruta #${routeId}: control no superado (score ${score}) sin bloqueo automático. Transportista: ${ctx.driverName}. Notificados: ${n}.`,
    });
}

// LGT-199 Esc.4 — el conductor no completó el re-chequeo pedido a tiempo.
async function notifyRecheckOmission({ check, branchId, routeId, minutes }) {
    const ctx = await resolveDriverContext(check?.userId, branchId);
    const vars = {
        transportistaNombre: ctx.driverName, transportistaId: check?.userId ?? '',
        sucursalNombre: branchLabel(ctx), sucursalId: ctx.branchId ?? '',
        rutaId: routeId ?? '', minutos: minutes ?? '',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_RECHECK_OMITTED', branchId: ctx.branchId, checkId: check?.id,
        defaultSubject: `[LogiTrack] Re-chequeo de fatiga sin realizar — Ruta #${routeId}`,
        defaultBody: `Re-chequeo de fatiga NO realizado.\nRuta #${routeId}\nTransportista: ${ctx.driverName}\nSucursal: ${branchLabel(ctx)}\nSin completar la prueba hace más de ${minutes} min.\n\nGestioná el caso en el panel: /fatigue`,
        vars, auditAction: 'NOTIFY_RECHECK_OMITTED',
        auditDetail: (n) => `Ruta #${routeId}: ${ctx.driverName} no completó el re-chequeo (>${minutes} min). Notificados: ${n}.`,
    });
}

// LGT-195 (intermedio) — el transportista rechazó el consentimiento (todavía sin
// alcanzar el límite). Se avisa al Supervisor de su sucursal en CADA rechazo.
async function notifyConsentRejected({ userId, branchId, routeId, rejections, max }) {
    const ctx = await resolveDriverContext(userId, branchId);
    const vars = {
        transportistaNombre: ctx.driverName, transportistaId: userId ?? '',
        sucursalNombre: branchLabel(ctx), sucursalId: ctx.branchId ?? '',
        rutaId: routeId ?? '', rechazos: rejections ?? '', maxRechazos: max ?? '',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_CONSENT_REJECTED', branchId: ctx.branchId, actorId: userId,
        defaultSubject: `[LogiTrack] Rechazo de consentimiento de fatiga — ${ctx.driverName}`,
        defaultBody: `El transportista ${ctx.driverName} (ID #${userId}) rechazó el consentimiento del control de fatiga.\nRuta #${routeId}\nSucursal: ${branchLabel(ctx)}\nRechazos: ${rejections}/${max} (al llegar al límite queda inhabilitado).\n\nSeguí el caso en: /fatigue`,
        vars, auditAction: 'NOTIFY_CONSENT_REJECTED',
        auditDetail: (n) => `${ctx.driverName} rechazó consentimiento (${rejections}/${max}). Notificados: ${n}.`,
    });
}

// LGT-195 — el transportista quedó INHABILITADO por alcanzar el límite de rechazos.
function notifyDriverDisabledByConsent({ driverId, driverName, branchId, branchName, routeId, rejections, max, reason }) {
    // Mantiene la sucursal del transportista resuelta por disableDriver (branchId ya es la suya).
    const vars = {
        transportistaNombre: driverName || `#${driverId}`, transportistaId: driverId,
        sucursalNombre: branchName || (branchId ? `#${branchId}` : 'N/D'), sucursalId: branchId || '',
        rutaId: routeId || '', rechazos: rejections ?? '', maxRechazos: max ?? '',
        motivoInhabilitacion: reason || 'CONSENT_REJECTED',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_DRIVER_DISABLED_CONSENT', branchId, actorId: driverId,
        defaultSubject: `[LogiTrack] Transportista inhabilitado por fatiga — ${vars.transportistaNombre}`,
        defaultBody: `Hola,\n\nEl transportista ${vars.transportistaNombre} (ID #${driverId}) quedó inhabilitado tras rechazar el consentimiento ${rejections}/${max} vez/veces.\nSucursal: ${vars.sucursalNombre}\nRuta: #${routeId}\n\nGestionalo en: /fatigue`,
        vars, auditAction: 'NOTIFY_DRIVER_DISABLED_CONSENT',
        auditDetail: (n) => `Transportista ${vars.transportistaNombre} inhabilitado por rechazo de consentimiento (${rejections}/${max}). Notificados: ${n}.`,
    });
}

// LGT-197 — patrón de fatiga recurrente.
async function notifyPattern({ userId, branchId, windowCount, windowDays }) {
    const ctx = await resolveDriverContext(userId, branchId);
    const vars = {
        transportistaNombre: ctx.driverName, transportistaId: userId ?? '',
        sucursalNombre: branchLabel(ctx), sucursalId: ctx.branchId ?? '',
        ventanaCantidad: windowCount ?? '', ventanaDias: windowDays ?? '',
    };
    return sendTemplated({
        eventCode: 'FATIGUE_PATTERN_RECURRENT', branchId: ctx.branchId, actorId: userId,
        defaultSubject: `[LogiTrack] Patrón de fatiga recurrente — Transportista #${userId}`,
        defaultBody: `Se detectó patrón de fatiga recurrente.\nTransportista: ${ctx.driverName} (#${userId})\nSucursal: ${branchLabel(ctx)}\n${windowCount} bloqueos en ${windowDays} días.\n\nRevisalo en el panel: /fatigue`,
        vars, auditAction: 'PATTERN_RECURRENT',
        auditDetail: (n) => `Patrón recurrente: #${userId} con ${windowCount} bloqueos en ${windowDays} días. Notificados: ${n}.`,
    });
}

module.exports = {
    audit, resolveRecipients, resolveDriverContext,
    deliverEmail, deliverEmailFormat,
    notifyBlock, notifyReview, notifyRecheckOmission, notifyPattern,
    notifyConsentRejected, notifyDriverDisabledByConsent,
};
