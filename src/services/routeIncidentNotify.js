// Notificación al supervisor cuando el repartidor reporta un incidente en ruta
// (RouteIncident). Best-effort: no debe romper el flujo del endpoint.
//
// Los destinatarios se resuelven igual que Ojo de Patrón (fatigue/notify):
// supervisores de la sucursal origen de la ruta + administradores. El toggle
// on/off del evento se respeta desde Ajustes → Comunicaciones, y la plantilla
// (subject/body) es editable.
const { Op } = require('sequelize');

const EVENT_CODE = 'ROUTE_INCIDENT_REPORTED';

const INCIDENT_TYPE_LABELS = {
    vehicular: 'Problema vehicular',
    accidente: 'Accidente',
    trafico:   'Tráfico severo',
    clima:     'Clima adverso',
    otro:      'Otro',
};
const SEVERITY_LABELS = {
    baja:  'Baja',
    media: 'Media',
    alta:  'Alta',
};

async function _resolveRecipients(branchId) {
    const { User } = require('../models/user');
    const { RoleType } = require('../constants/enums');
    const or = [{ roleId: RoleType.ADMIN.id }];
    if (branchId) { or.push({ roleId: RoleType.SUPERVISOR.id, branchId }); }
    const users = await User.findAll({
        where: { [Op.or]: or },
        attributes: ['id', 'email', 'fullName', 'roleId'],
    });
    return users.map(u => u.toJSON());
}

async function _resolveDriverName(userId) {
    if (!userId) { return 'N/D'; }
    try {
        const { User } = require('../models/user');
        const u = await User.findByPk(userId, { attributes: ['fullName'] });
        return u?.fullName || `#${userId}`;
    } catch { return `#${userId}`; }
}

async function _resolveBranchName(branchId) {
    if (!branchId) { return 'N/D'; }
    try {
        const { Branch } = require('../models/branch');
        const b = await Branch.findByPk(branchId, { attributes: ['name'] });
        return b?.name || `#${branchId}`;
    } catch { return `#${branchId}`; }
}

async function _eventEnabled() {
    try {
        const { getConfigByEvent } = require('../models/notificationConfig');
        const cfg = await getConfigByEvent(EVENT_CODE);
        return cfg ? cfg.enabled : true; // default ON si aún no migrado
    } catch { return true; }
}

// Envía el aviso al supervisor. `incident` = RouteIncident recién creado; `route` = ruta
// cargada con `originBranchId` (y opcionalmente driver/transport). Devuelve la cantidad
// de mails enviados (0 = plantilla off, no había destinatarios, o error silenciado).
async function notifySupervisor(incident, route) {
    try {
        if (!(await _eventEnabled())) { return 0; }

        const branchId = route?.originBranchId || null;
        const [recipients, driverName, branchName] = await Promise.all([
            _resolveRecipients(branchId),
            _resolveDriverName(incident.userId),
            _resolveBranchName(branchId),
        ]);
        if (!recipients.length) { return 0; }

        const typeKey = String(incident.incidentType || '').toLowerCase();
        const sevKey  = String(incident.severity || '').toLowerCase();
        const vars = {
            routeId:      route?.id || incident.routeId || '',
            incidentType: INCIDENT_TYPE_LABELS[typeKey] || incident.incidentType || 'Incidente',
            severity:     SEVERITY_LABELS[sevKey] || incident.severity || '',
            driverName,
            branchName,
            description:  incident.description || '(sin descripción)',
        };

        // Panel del supervisor para gestionar/resolver — se resuelve absoluto vía baseUrl.
        try {
            const ph = require('./notificationPlaceholders');
            vars.panelUrl = `${ph.baseUrl()}/supervision/route-incidents`;
        } catch { vars.panelUrl = '/supervision/route-incidents'; }

        // Plantilla editable desde Ajustes → Comunicaciones. Si falta, uso texto default.
        let subject = `[LogiTrack] Incidente en ruta #${vars.routeId} — ${vars.incidentType} (${vars.severity})`;
        let body = `Un repartidor reportó un incidente durante su recorrido.\n\n`
                 + `Ruta: #${vars.routeId}\nSucursal: ${vars.branchName}\nTransportista: ${vars.driverName}\n`
                 + `Tipo: ${vars.incidentType}\nSeveridad: ${vars.severity}\n\nDetalle:\n${vars.description}\n\n`
                 + `Panel: ${vars.panelUrl}`;
        let format = 'text';
        try {
            const emailTemplateModel = require('../models/emailTemplate');
            const placeholders = require('./notificationPlaceholders');
            const tpl = await emailTemplateModel.getDefaultByEventCode(EVENT_CODE);
            if (tpl) {
                subject = placeholders.render(tpl.subject, vars) || subject;
                body    = placeholders.render(tpl.body, vars)    || body;
                format  = tpl.format === 'html' ? 'html' : 'text';
            }
        } catch (e) {
            console.warn(`[route-incident][notify] plantilla ${EVENT_CODE} no disponible:`, e.message);
        }

        // Deduplica emails y envía (reusa el mismo sender que el resto del sistema).
        const seen = new Set();
        const emails = [];
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const r of recipients) {
            const e = String(r.email || '').trim();
            if (!EMAIL_RE.test(e)) { continue; }
            const key = e.toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key); emails.push(e);
        }
        if (!emails.length) { return 0; }
        const { sendEmail } = require('./notification/emailSender');
        await sendEmail(emails, subject, body, format === 'html' ? 'html' : 'text');
        return emails.length;
    } catch (e) {
        console.error('[route-incident][notify] error:', e.message);
        return 0;
    }
}

module.exports = { notifySupervisor, EVENT_CODE };
