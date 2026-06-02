const settingModel = require('../models/setting');
const provinceModel = require('../models/province');
const branchModel = require('../models/branch');
const userModel = require('../models/user');
const { PROVINCES } = require('../utils/provinces');
const NotificationConfigModel = require('../models/notificationConfig');
const emailTemplateModel = require('../models/emailTemplate');
const settingLogModel = require('../models/settingLog');
const { expireShipments } = require('../utils/expireShipments');
// Sprint 3 - 2.5 parámetros configurables
const failedReasonModel = require('../models/failedAttemptReason');
const standardMessageModel = require('../models/standardMessage');
const deliveryWindowModel = require('../models/deliveryTimeWindow');
const incidentTypeModel = require('../models/incidentType');
const incidentNotifConfig = require('../services/incidentNotifConfig');
const { queueEmail } = require('../services/notification/notificationEmailService');

const getSettings = async (req, res) => {
    const [settings, provinces, branches, users, routeOpt, notifConfig, emailTemplates, settingLogs,
        failedReasons, stdMessages, timeWindows, incidentTypes, incidentNotif] = await Promise.all([
            settingModel.getAll(),
            provinceModel.getAll(),
            branchModel.getAll(),
            userModel.getAll(),
            getRouteOptimizerSettings(),
            NotificationConfigModel.getAllConfigs(),
            emailTemplateModel.getAll(),
            settingLogModel.getAll(),
            failedReasonModel.getAll().catch(() => []),
            standardMessageModel.getAll().catch(() => []),
            deliveryWindowModel.getAll().catch(() => []),
            incidentTypeModel.IncidentType?.findAll?.({ order: [['description', 'ASC']] }).catch(() => []) || [],
            incidentNotifConfig.get().catch(() => ({ ...incidentNotifConfig.DEFAULTS })),
        ]);

    const templatesByEvent = {};
    for (const t of emailTemplates) {
        templatesByEvent[t.eventCode] = { subject: t.subject, body: t.body };
    }

    if (!settings.origin_province_id) { settings.origin_province_id = '24'; }

    res.render('setting/index', {
        settings, notifConfig, templatesByEvent, provinces, branches, users, routeOpt, settingLogs,
        failedReasons, stdMessages, timeWindows, incidentTypes, incidentNotif,
        params: {
            // Sprint 3 - 2.5: reglas de reprogramación parametrizables
            reschedule_default_days: settings.reschedule_default_days || '1',
            reschedule_max_per_envio: settings.reschedule_max_per_envio || '3',
            max_intentos_fallidos: settings.max_intentos_fallidos || '3',
            dias_expiracion_envio: settings.dias_expiracion_envio || '30',
            notificaciones_activas: settings.notificaciones_activas || 'true',
            horario_entrega_inicio: settings.horario_entrega_inicio || '08:00',
            horario_entrega_fin: settings.horario_entrega_fin || '20:00',
            peso_maximo_envio: settings.peso_maximo_envio || '50',
            cantidad_maxima_paquetes: settings.cantidad_maxima_paquetes || '20',
            costo_base_envio: settings.costo_base_envio || '500',
            nombre_empresa: settings.nombre_empresa || 'LogiTrack',
            telefono_soporte: settings.telefono_soporte || '0800-555-5678',
            email_soporte: settings.email_soporte || 'soporte@logitrack.com',
            proceso_revisar_expirados_hora: settings.proceso_revisar_expirados_hora || '02:00',
            proceso_revisar_prioridades_hora: settings.proceso_revisar_prioridades_hora || '03:00',
            proceso_generar_reportes_hora: settings.proceso_generar_reportes_hora || '04:00',
            proceso_notificaciones_hora: settings.proceso_notificaciones_hora || '05:00',
            test_email_override: settings.test_email_override || '',
        }
    });
};

const VALID_RECIPIENT_MODES = ['recipient', 'sender', 'both', 'custom'];
const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const saveNotificationConfig = async (req, res) => {
    try {
        const configs = await NotificationConfigModel.getAllConfigs();
        for (const cfg of configs) {
            const enabled = req.body[`enabled_${cfg.eventCode}`] === 'on';
            let mode = req.body[`mode_${cfg.eventCode}`] || 'recipient';
            let custom = (req.body[`custom_${cfg.eventCode}`] || '').trim();

            if (!VALID_RECIPIENT_MODES.includes(mode)) { mode = 'recipient'; }
            if (mode === 'custom' && !isValidEmail(custom)) {
                return res.redirect('/setting?error=custom_email_invalid');
            }
            if (mode !== 'custom') { custom = null; }

            await NotificationConfigModel.NotificationConfig.update(
                { enabled, recipientMode: mode, customEmail: custom },
                { where: { id: cfg.id } }
            );
        }
        res.redirect('/setting?success=notif');
    } catch (err) {
        console.error('saveNotificationConfig:', err.message);
        res.status(500).redirect('/setting?error=notif_save');
    }
};

const saveEmailTemplate = async (req, res) => {
    try {
        const { eventCode } = req.params;
        const subject = (req.body.subject || '').trim();
        const body = (req.body.body || '').trim();
        if (!subject || !body) {
            return res.redirect('/setting?error=template_empty');
        }
        const updated = await emailTemplateModel.updateTemplate(eventCode, { subject, body });
        if (!updated) { return res.redirect('/setting?error=template_not_found'); }
        res.redirect('/setting?success=tpl');
    } catch (err) {
        console.error('saveEmailTemplate:', err.message);
        res.status(500).redirect('/setting?error=tpl_save');
    }
};

const saveTestEmailOverride = async (req, res) => {
    try {
        const value = (req.body.test_email_override || '').trim();
        if (value && !isValidEmail(value)) {
            return res.redirect('/setting?error=override_invalid');
        }
        const oldValue = await settingModel.get('test_email_override');
        await settingLogModel.logChange(res.locals.currentUser?.id, 'test_email_override', oldValue, value);
        await settingModel.set('test_email_override', value);
        res.redirect('/setting?success=override');
    } catch (err) {
        console.error('saveTestEmailOverride:', err.message);
        res.status(500).redirect('/setting?error=override_save');
    }
};

const GEOREF = 'https://apis.datos.gob.ar/georef/api';

async function geocodeOrigin(street, number, province) {
    try {
        const query = `${street} ${number}`;
        const url = `${GEOREF}/direcciones?direccion=${encodeURIComponent(query)}&provincia=${province.indec}&max=1&campos=estandar`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await resp.json();
        const item = (data.direcciones || [])[0];
        if (item?.ubicacion?.lat) {
            return { lat: item.ubicacion.lat, lng: item.ubicacion.lon };
        }
    } catch { /* usa centroide como fallback */ }
    return null;
}

const saveSettings = async (req, res) => {
    const { origin_province_id, origin_street, origin_number, origin_postal_code } = req.body;
    const provinceId = parseInt(origin_province_id);
    const province = PROVINCES[provinceId];

    if (!province) { return res.redirect('/setting'); }

    // Intenta geocodificar la dirección exacta; si falla usa el centroide de la provincia
    let lat = province.lat;
    let lng = province.lng;

    const street = (origin_street || '').trim();
    const number = (origin_number || '').trim();

    if (street && number) {
        const coords = await geocodeOrigin(street, number, province);
        if (coords) { lat = coords.lat; lng = coords.lng; }
    }

    await Promise.all([
        settingModel.set('origin_province_id', String(provinceId)),
        settingModel.set('origin_province_ml', province.ml),
        settingModel.set('origin_lat', String(lat)),
        settingModel.set('origin_lng', String(lng)),
        settingModel.set('origin_street', street),
        settingModel.set('origin_number', number),
        settingModel.set('origin_postal_code', (origin_postal_code || '').trim()),
    ]);

    res.redirect('/setting?success=1');
};

const ROUTE_SETTINGS = {
    piggyback_enabled: { default: 'false', parse: v => v === 'true' || v === 'on' || v === '1' },
    piggyback_max_extra_pct: { default: '15', parse: v => Math.max(0, Number(v) || 0) },
    piggyback_max_extra_km: { default: '30', parse: v => Math.max(0, Number(v) || 0) },
    piggyback_max_extra_cost_pct: { default: '20', parse: v => Math.max(0, Number(v) || 0) },
    urgent_combine_enabled: { default: 'true', parse: v => v === 'true' || v === 'on' || v === '1' },
    urgent_combine_max_km: { default: '15', parse: v => Math.max(0, Number(v) || 0) },
    cluster_merge_radius_km: { default: '60', parse: v => Math.max(0, Number(v) || 0) },
};

const getRouteOptimizerSettings = async () => {
    const result = {};
    for (const [key, cfg] of Object.entries(ROUTE_SETTINGS)) {
        const raw = await settingModel.get(key);
        result[key] = cfg.parse(raw ?? cfg.default);
    }
    return result;
};

const saveRouteOptimizerSettings = async (req, res) => {
    const body = req.body || {};
    const piggyEnabled = body.piggyback_enabled === 'on' || body.piggyback_enabled === 'true' || body.piggyback_enabled === '1';
    const urgentEnabled = body.urgent_combine_enabled === 'on' || body.urgent_combine_enabled === 'true' || body.urgent_combine_enabled === '1';
    await Promise.all([
        settingModel.set('piggyback_enabled', piggyEnabled ? 'true' : 'false'),
        settingModel.set('piggyback_max_extra_pct', String(Math.max(0, Number(body.piggyback_max_extra_pct) || 0))),
        settingModel.set('piggyback_max_extra_km', String(Math.max(0, Number(body.piggyback_max_extra_km) || 0))),
        settingModel.set('piggyback_max_extra_cost_pct', String(Math.max(0, Number(body.piggyback_max_extra_cost_pct) || 0))),
        settingModel.set('urgent_combine_enabled', urgentEnabled ? 'true' : 'false'),
        settingModel.set('urgent_combine_max_km', String(Math.max(0, Number(body.urgent_combine_max_km) || 0))),
        settingModel.set('cluster_merge_radius_km', String(Math.max(0, Number(body.cluster_merge_radius_km) || 0))),
    ]);
    res.redirect('/setting?success=3');
};

const assignBranch = async (req, res) => {
    const userIds = [].concat(req.body['userId[]'] || req.body.userId || []);
    const branchIds = [].concat(req.body['branchId[]'] || req.body.branchId || []);

    if (userIds.length === 0) { return res.redirect('/setting'); }

    await Promise.all(
        userIds.map((uid, i) => {
            const userId = parseInt(uid);
            const branchId = branchIds[i] ? parseInt(branchIds[i]) : null;
            return userModel.update(userId, { branchId });
        })
    );

    res.redirect('/setting?success=2');
};

const saveParams = async (req, res) => {
    try {
        const params = [
            'max_intentos_fallidos',
            'dias_expiracion_envio',
            'notificaciones_activas',
            'horario_entrega_inicio',
            'horario_entrega_fin',
            'peso_maximo_envio',
            'cantidad_maxima_paquetes',
            'costo_base_envio',
            'nombre_empresa',
            'telefono_soporte',
            'email_soporte',
            'proceso_revisar_expirados_hora',
            'proceso_revisar_prioridades_hora',
            'proceso_generar_reportes_hora',
            'proceso_notificaciones_hora',
            // Sprint 3 - 2.5 reglas de reprogramación
            'reschedule_default_days',
            'reschedule_max_per_envio',
        ];

        // Validaciones
        const maxIntentos = parseInt(req.body.max_intentos_fallidos);
        if (isNaN(maxIntentos) || maxIntentos < 1 || maxIntentos > 10) {
            return res.redirect('/setting?error=max_intentos');
        }

        const diasExpiracion = parseInt(req.body.dias_expiracion_envio);
        if (isNaN(diasExpiracion) || diasExpiracion < 1 || diasExpiracion > 365) {
            return res.redirect('/setting?error=dias_expiracion');
        }
        const pesoMax = parseFloat(req.body.peso_maximo_envio);
        if (isNaN(pesoMax) || pesoMax < 1 || pesoMax > 999) {
            return res.redirect('/setting?error=peso_maximo');
        }

        const cantMax = parseInt(req.body.cantidad_maxima_paquetes);
        if (isNaN(cantMax) || cantMax < 1 || cantMax > 999) {
            return res.redirect('/setting?error=cantidad_maxima');
        }

        const costoBase = parseFloat(req.body.costo_base_envio);
        if (isNaN(costoBase) || costoBase < 0) {
            return res.redirect('/setting?error=costo_base');
        }

        const horaInicio = req.body.horario_entrega_inicio;
        const horaFin = req.body.horario_entrega_fin;
        if (horaInicio >= horaFin) {
            return res.redirect('/setting?error=horario');
        }

        const currentSettings = await settingModel.getAll();

        await Promise.all(params.map(async key => {
            const oldValue = currentSettings[key] || null;
            let value;
            if (key === 'notificaciones_activas') {
                value = req.body[key] === 'true' ? 'true' : 'false';
            } else {
                value = req.body[key] || '';
            }
            await settingLogModel.logChange(res.locals.currentUser?.id, key, oldValue, value);
            return settingModel.set(key, value);
        }));

        // Notificaciones por evento se gestionan en /setting/notification-config (card aparte)

        // Ejecutar proceso automático de expiración
        expireShipments();
        res.redirect('/setting?success=4');
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

// =========================================================================
// Sprint 3 - 2.5 Parámetros editables: motivos fallidos, mensajes, franjas, motivos incidencia
// =========================================================================
const saveFailedReason = async (req, res) => {
    try {
        const { id } = req.params;
        if (req.body._action === 'create') {
            const { FailedAttemptReason } = require('../models/failedAttemptReason');
            await FailedAttemptReason.create({
                code: (req.body.code || '').trim().toLowerCase().replace(/\s+/g, '_'),
                label: (req.body.label || '').trim(),
                retryDays: parseInt(req.body.retryDays) || 1,
                active: req.body.active === 'on',
                createsIncident: req.body.createsIncident === 'on',
            });
        } else if (req.body._action === 'delete' && id) {
            const { FailedAttemptReason } = require('../models/failedAttemptReason');
            await FailedAttemptReason.destroy({ where: { id } });
        } else if (id) {
            const { FailedAttemptReason } = require('../models/failedAttemptReason');
            await FailedAttemptReason.update({
                label: (req.body.label || '').trim(),
                retryDays: parseInt(req.body.retryDays) || 1,
                active: req.body.active === 'on',
                createsIncident: req.body.createsIncident === 'on',
            }, { where: { id } });
        }
        res.redirect('/setting?success=failed_reason');
    } catch (err) {
        console.error('saveFailedReason:', err.message);
        res.redirect('/setting?error=failed_reason');
    }
};

const saveStandardMessage = async (req, res) => {
    try {
        const { code } = req.params;
        const body = (req.body.body || '').trim();
        if (!code || !body) { return res.redirect('/setting?error=std_msg_empty'); }
        const updated = await standardMessageModel.updateByCode(code, body);
        if (!updated) { return res.redirect('/setting?error=std_msg_not_found'); }
        res.redirect('/setting?success=std_msg');
    } catch (err) {
        console.error('saveStandardMessage:', err.message);
        res.redirect('/setting?error=std_msg');
    }
};

const saveTimeWindow = async (req, res) => {
    try {
        const { DeliveryTimeWindow } = require('../models/deliveryTimeWindow');
        const { id } = req.params;
        if (req.body._action === 'create') {
            await DeliveryTimeWindow.create({
                label: (req.body.label || '').trim(),
                fromTime: req.body.fromTime,
                toTime: req.body.toTime,
                active: req.body.active === 'on',
            });
        } else if (req.body._action === 'delete' && id) {
            await DeliveryTimeWindow.destroy({ where: { id } });
        } else if (id) {
            await DeliveryTimeWindow.update({
                label: (req.body.label || '').trim(),
                fromTime: req.body.fromTime,
                toTime: req.body.toTime,
                active: req.body.active === 'on',
            }, { where: { id } });
        }
        res.redirect('/setting?success=time_window');
    } catch (err) {
        console.error('saveTimeWindow:', err.message);
        res.redirect('/setting?error=time_window');
    }
};

const saveIncidentType = async (req, res) => {
    try {
        const { IncidentType } = require('../models/incidentType');
        const { id } = req.params;
        if (!IncidentType) { return res.redirect('/setting?error=inc_type_model'); }
        if (req.body._action === 'create') {
            await IncidentType.create({
                code: (req.body.code || '').trim().toUpperCase().replace(/\s+/g, '_'),
                description: (req.body.label || '').trim(),
                active: req.body.active === 'on',
            });
        } else if (req.body._action === 'delete' && id) {
            await IncidentType.update({ active: false }, { where: { id } });
        } else if (id) {
            await IncidentType.update({
                description: (req.body.label || '').trim(),
                active: req.body.active === 'on',
            }, { where: { id } });
        }
        res.redirect('/setting?success=inc_type');
    } catch (err) {
        console.error('saveIncidentType:', err.message);
        res.redirect('/setting?error=inc_type');
    }
};

const saveIncidentNotifConfig = async (req, res) => {
    try {
        await incidentNotifConfig.set({
            notifySupervisorBranch: req.body.notifySupervisorBranch === 'on',
            notifyAssignedOperator: req.body.notifyAssignedOperator === 'on',
            notifyAdmins: req.body.notifyAdmins === 'on',
            notifyReporter: req.body.notifyReporter === 'on',
            notifyShipmentRecipient: req.body.notifyShipmentRecipient === 'on',
            customEmails: req.body.customEmails || ''
        });
        res.redirect('/setting?success=incident_notif');
    } catch (err) {
        console.error('saveIncidentNotifConfig:', err.message);
        res.status(500).redirect('/setting?error=incident_notif');
    }
};

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const testShipmentNotification = async (req, res) => {
    const { emailRecipients, shipmentEventCode, template } = req.body;


    const recipients = emailRecipients.split(',').map(e => e.trim()).filter(e => isValidEmail(e));
    if (recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid email addresses provided.' });
    };

    template.body = template.body.replace('{{fullName}}', 'Sujeto123').replace('{{trackingCode}}', 'TRACK123456');

    for (const recipient of recipients) {
        try {
            await queueEmail({ recipient: recipient, subject: template.subject, body: template.body });
        } catch (error) {
            console.error(`Error sending email to ${recipient}:`, error);
        }
    };
};

const testShipmentNotificationV2 = async (req, res) => {
    const { emailRecipients, shipmentEventCode, template, placeHolders} = req.body;

    const recipients = emailRecipients.split(',').map(e => e.trim()).filter(e => isValidEmail(e));
    if (recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid email addresses provided.' });
    };

    if (shipmentEventCode) {
        template = await emailTemplateModel.getByEventCode(shipmentEventCode);
    }
    
    for (const [key, value] of Object.entries(placeHolders)) {
        template.body = template.body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        template.subject = template.subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const regex = /{{\s*[\s\S]*?\s*}}/g;
    template.body = template.body.replace(regex, "--invalid placeholder--");

    for (const recipient of recipients) {
        try {
            await queueEmail({ recipient: recipient, subject: template.subject, body: template.body });
        } catch (error) {
            console.error(`Error sending email to ${recipient}:`, error);
        }
    }
};

module.exports = {
    getSettings, saveSettings, assignBranch, saveRouteOptimizerSettings, getRouteOptimizerSettings,
    saveParams, saveNotificationConfig, saveEmailTemplate, saveTestEmailOverride,
    saveFailedReason, saveStandardMessage, saveTimeWindow, saveIncidentType,
    saveIncidentNotifConfig, testShipmentNotification
};
