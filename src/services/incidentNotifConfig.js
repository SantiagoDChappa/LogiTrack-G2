const settingModel = require('../models/setting');
const { User } = require('../models/user');
const { RoleType } = require('../constants/enums');

const SETTING_KEY = 'incident_notif_config';

const DEFAULTS = Object.freeze({
    notifySupervisorBranch:  true,
    notifyAssignedOperator:  true,
    notifyAdmins:            false,
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

// Devuelve lista deduplicada de emails segun config y contexto (shipment, assignee, openedBy).
const resolveRecipients = async (cfg, { shipment: _shipment, assignee, openedBy }) => {
    const out = new Set();
    const pushUserEmail = (u) => { if (u?.email) { out.add(u.email); } };

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
    if (cfg.notifyReporter && openedBy?.id !== assignee?.id) {
        pushUserEmail(openedBy);
    }
    parseEmails(cfg.customEmails).forEach(e => out.add(e));

    return Array.from(out).filter(isValidEmail);
};

module.exports = { get, set, resolveRecipients, DEFAULTS, SETTING_KEY };
