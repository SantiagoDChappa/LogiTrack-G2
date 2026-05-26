const settingModel = require('../models/setting');
const { User } = require('../models/user');
const { RoleType } = require('../constants/enums');

const SETTING_KEY = 'incident_notif_config';

const DEFAULTS = Object.freeze({
    notifySupervisorBranch:  true,
    notifyAssignedOperator:  true,
    // Activado: cuando llega una incidencia desde el portal publico el admin la recibe
    // para poder asignarla manualmente al supervisor que corresponda.
    notifyAdmins:            true,
    notifyReporter:          false,
    notifyShipmentRecipient: false,
    customEmails:            ''
});

const BOOLEAN_KEYS = [
    'notifySupervisorBranch',
    'notifyAssignedOperator',
    'notifyAdmins',
    'notifyReporter',
    'notifyShipmentRecipient'
];

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const parseEmails = (raw) => String(raw || '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(isValidEmail);

const get = async () => {
    const raw = await settingModel.get(SETTING_KEY);
    if (!raw) { return { ...DEFAULTS }; }
    try {
        const parsed = JSON.parse(raw);
        const out = { ...DEFAULTS };
        for (const k of BOOLEAN_KEYS) {
            if (typeof parsed[k] === 'boolean') { out[k] = parsed[k]; }
        }
        if (typeof parsed.customEmails === 'string') { out.customEmails = parsed.customEmails; }
        return out;
    } catch {
        return { ...DEFAULTS };
    }
};

const set = async (input) => {
    const next = { ...DEFAULTS };
    for (const k of BOOLEAN_KEYS) { next[k] = Boolean(input[k]); }
    next.customEmails = parseEmails(input.customEmails).join(', ');
    await settingModel.set(SETTING_KEY, JSON.stringify(next));
    return next;
};

// Devuelve lista deduplicada de emails segun config y contexto.
// context = {
//   shipment,             // requerido — incluido con sender + recipient
//   assignee,             // null si todavia no se asigno (caso portal publico recien creada)
//   openedBy,             // user staff que la abrio (null si vino del portal)
//   reporterEmail,        // email del reporter externo (cuando openedBy es null)
//   matchedRole,          // 'sender' | 'recipient' | null — para item #10 (otro extremo del envio)
// }
const resolveRecipients = async (cfg, context) => {
    const { shipment, assignee, openedBy, reporterEmail, matchedRole } = context || {};
    const out = new Set();
    const pushUserEmail = (u) => { if (u?.email) { out.add(u.email); } };
    const pushPersonEmail = (p) => { if (p?.email) { out.add(p.email); } };

    if (cfg.notifySupervisorBranch && assignee?.branchId) {
        const supervisors = await User.findAll({
            where: { roleId: RoleType.SUPERVISOR.id, branchId: assignee.branchId, active: true },
            attributes: ['id', 'email']
        });
        supervisors.forEach(pushUserEmail);
    }
    if (cfg.notifyAssignedOperator && assignee?.roleId === RoleType.OPERATOR.id) {
        pushUserEmail(assignee);
    }
    if (cfg.notifyAdmins) {
        const admins = await User.findAll({
            where: { roleId: RoleType.ADMIN.id, active: true },
            attributes: ['id', 'email']
        });
        admins.forEach(pushUserEmail);
    }
    if (cfg.notifyReporter) {
        if (openedBy && openedBy.id !== assignee?.id) { pushUserEmail(openedBy); }
        if (!openedBy && reporterEmail)                { out.add(String(reporterEmail).trim()); }
    }
    if (cfg.notifyShipmentRecipient && shipment?.recipient?.email) {
        out.add(shipment.recipient.email);
    }

    // Item #10: si el reporter es uno de los dos extremos del envio, notificar al otro extremo.
    // Esto es comportamiento implicito (sin flag): cuando el destinatario reclama, queremos
    // que el remitente se entere; y viceversa.
    if (matchedRole === 'recipient' && shipment?.sender)    { pushPersonEmail(shipment.sender); }
    if (matchedRole === 'sender'    && shipment?.recipient) { pushPersonEmail(shipment.recipient); }

    parseEmails(cfg.customEmails).forEach(e => out.add(e));

    return Array.from(out).filter(isValidEmail);
};

module.exports = { get, set, resolveRecipients, DEFAULTS, SETTING_KEY };
