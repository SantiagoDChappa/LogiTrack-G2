const settingModel = require('../models/setting');
const provinceModel = require('../models/province');
const branchModel = require('../models/branch');
const userModel = require('../models/user');
const { PROVINCES } = require('../utils/provinces');
const NotificationConfigModel = require('../models/notificationConfig');
const emailTemplateModel = require('../models/emailTemplate');
const notificationVariableModel = require('../models/notificationVariable');
const emailSnippetModel = require('../models/emailSnippet');
const placeholders = require('../services/notificationPlaceholders');
const { queueEmail } = require('../services/notification/notificationEmailService');
const settingLogModel = require('../models/settingLog');
const { expireShipments } = require('../utils/expireShipments');
// Sprint 3 - 2.5 parámetros configurables
const failedReasonModel = require('../models/failedAttemptReason');
const standardMessageModel = require('../models/standardMessage');
const deliveryWindowModel = require('../models/deliveryTimeWindow');
const incidentTypeModel = require('../models/incidentType');
const incidentNotifConfig = require('../services/incidentNotifConfig');
const statusModel = require('../models/status');
const statusColors = require('../services/statusColors');

// LGT-174: secciones de Ajustes (cada una es su propia página, navegada desde el menú).
const SETTING_SECTIONS = ['general', 'comunicaciones', 'plantillas', 'ruteo', 'catalogos', 'auditoria'];

// Tras guardar, vuelve a la sección desde la que se envió el formulario (vía Referer).
function settingBack(req, suffix = '') {
    const ref = req.get('Referer') || '';
    const m = ref.match(/\/setting\/(general|comunicaciones|plantillas|ruteo|catalogos|auditoria)\b/);
    return `/setting/${m ? m[1] : 'general'}${suffix}`;
}

const getSettings = async (req, res) => {
    const [settings, provinces, branches, users, routeOpt, notifConfig, emailTemplates, settingLogs,
           failedReasons, stdMessages, timeWindows, incidentTypes, incidentNotif,
           customVariables, emailSnippets] = await Promise.all([
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
        notificationVariableModel.getAll().catch(() => []),
        emailSnippetModel.getAll().catch(() => []),
    ]);

    // LGT-173: estados con su color configurado (o vacío) para la tarjeta de colores.
    const statusList = await statusModel.getAll().catch(() => []);
    const statusColorList = statusList.map(s => ({
        id: s.id,
        description: s.description,
        color: settings[statusColors.keyFor(s.id)] || '',
    }));

    // Variantes de plantilla agrupadas por evento (lista). La 1ra es la predeterminada.
    const templatesByEvent = {};
    for (const t of emailTemplates) {
        const item = { id: t.id, name: t.name || 'Principal', subject: t.subject, body: t.body, format: t.format || 'text', isDefault: !!t.isDefault };
        (templatesByEvent[t.eventCode] = templatesByEvent[t.eventCode] || []).push(item);
    }
    for (const ev of Object.keys(templatesByEvent)) {
        templatesByEvent[ev].sort((a, b) => (b.isDefault - a.isDefault) || (a.id - b.id));
    }

    // Catálogo de placeholders de datos (agrupado) para los chips del editor.
    const placeholderGroups = {};
    for (const p of placeholders.catalogMeta()) {
        (placeholderGroups[p.group] = placeholderGroups[p.group] || []).push(p);
    }
    // Valores de ejemplo (datos del envío de muestra + variables custom) para la preview/prueba.
    const sampleVars = { ...placeholders.buildVars(placeholders.sampleShipment()) };
    for (const v of customVariables) { sampleVars[v.key] = v.value; }

    if (!settings.origin_province_id) { settings.origin_province_id = '24'; }

    const activeSection = SETTING_SECTIONS.includes(req.params.section) ? req.params.section : 'general';

    res.render('setting/index', {
        settings, notifConfig, templatesByEvent, provinces, branches, users, routeOpt, settingLogs,
        failedReasons, stdMessages, timeWindows, incidentTypes, incidentNotif,
        placeholderGroups, customVariables, emailSnippets, sampleVars,
        statusColorList, activeSection,
        params: {
            // Sprint 3 - 2.5: reglas de reprogramación parametrizables
            reschedule_default_days:  settings.reschedule_default_days  || '1',
            reschedule_max_per_envio: settings.reschedule_max_per_envio || '3',
            max_intentos_fallidos:    settings.max_intentos_fallidos    || '3',
            dias_expiracion_envio:    settings.dias_expiracion_envio    || '30',
            notificaciones_activas:   settings.notificaciones_activas   || 'true',
            horario_entrega_inicio:   settings.horario_entrega_inicio   || '08:00',
            horario_entrega_fin:      settings.horario_entrega_fin      || '20:00',
            peso_maximo_envio:        settings.peso_maximo_envio        || '50',
            cantidad_maxima_paquetes: settings.cantidad_maxima_paquetes || '20',
            costo_base_envio:         settings.costo_base_envio         || '500',
            nombre_empresa:           settings.nombre_empresa           || 'LogiTrack',
            logo_empresa:             settings.logo_empresa             || '',
            telefono_soporte:         settings.telefono_soporte         || '0800-555-5678',
            email_soporte:            settings.email_soporte            || 'soporte@logitrack.com',
            proceso_revisar_expirados_hora:    settings.proceso_revisar_expirados_hora    || '02:00',
            proceso_revisar_prioridades_hora:  settings.proceso_revisar_prioridades_hora  || '03:00',
            proceso_generar_reportes_hora:     settings.proceso_generar_reportes_hora     || '04:00',
            proceso_notificaciones_hora:       settings.proceso_notificaciones_hora       || '05:00',
            test_email_override:               settings.test_email_override               || '',
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
            let mode      = req.body[`mode_${cfg.eventCode}`] || 'recipient';
            let custom    = (req.body[`custom_${cfg.eventCode}`] || '').trim();

            if (!VALID_RECIPIENT_MODES.includes(mode)) { mode = 'recipient'; }
            if (mode === 'custom' && !isValidEmail(custom)) {
                return res.redirect(settingBack(req, '?error=custom_email_invalid'));
            }
            if (mode !== 'custom') { custom = null; }

            await NotificationConfigModel.NotificationConfig.update(
                { enabled, recipientMode: mode, customEmail: custom },
                { where: { id: cfg.id } }
            );
        }
        res.redirect(settingBack(req, '?success=notif'));
    } catch (err) {
        console.error('saveNotificationConfig:', err.message);
        res.status(500).redirect(settingBack(req, '?error=notif_save'));
    }
};

// Edita la plantilla predeterminada del evento (compatibilidad).
const saveEmailTemplate = async (req, res) => {
    try {
        const { eventCode } = req.params;
        const subject = (req.body.subject || '').trim();
        const body    = (req.body.body    || '').trim();
        const format  = req.body.format === 'html' ? 'html' : 'text';
        const name    = (req.body.name || '').trim() || undefined;
        if (!subject || !body) { return res.redirect(settingBack(req, '?error=template_empty')); }
        const updated = await emailTemplateModel.updateTemplate(eventCode, { subject, body, format, name });
        if (!updated) { return res.redirect(settingBack(req, '?error=template_not_found')); }
        res.redirect(settingBack(req, '?success=tpl'));
    } catch (err) {
        console.error('saveEmailTemplate:', err.message);
        res.status(500).redirect(settingBack(req, '?error=tpl_save'));
    }
};

// Edita una variante puntual por id.
const updateEmailTemplateById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const subject = (req.body.subject || '').trim();
        const body    = (req.body.body    || '').trim();
        const format  = req.body.format === 'html' ? 'html' : 'text';
        const name    = (req.body.name || '').trim() || undefined;
        if (!subject || !body) { return res.redirect(settingBack(req, '?error=template_empty')); }
        const updated = await emailTemplateModel.updateById(id, { subject, body, format, name });
        if (!updated) { return res.redirect(settingBack(req, '?error=template_not_found')); }
        res.redirect(settingBack(req, '?success=tpl'));
    } catch (err) {
        console.error('updateEmailTemplateById:', err.message);
        res.status(500).redirect(settingBack(req, '?error=tpl_save'));
    }
};

const createEmailTemplateVariant = async (req, res) => {
    try {
        const { eventCode } = req.params;
        const name    = (req.body.name || '').trim() || 'Variante';
        const subject = (req.body.subject || '').trim() || '(sin asunto)';
        const body    = (req.body.body    || '').trim();
        const format  = req.body.format === 'html' ? 'html' : 'text';
        await emailTemplateModel.createVariant(eventCode, { name, subject, body, format });
        res.redirect(settingBack(req, '?success=tpl'));
    } catch (err) {
        console.error('createEmailTemplateVariant:', err.message);
        res.status(500).redirect(settingBack(req, '?error=tpl_save'));
    }
};

const setDefaultEmailTemplate = async (req, res) => {
    try {
        await emailTemplateModel.setDefault(Number(req.params.id));
        res.redirect(settingBack(req, '?success=tpl'));
    } catch (err) {
        console.error('setDefaultEmailTemplate:', err.message);
        res.status(500).redirect(settingBack(req, '?error=tpl_save'));
    }
};

const deleteEmailTemplate = async (req, res) => {
    try {
        const r = await emailTemplateModel.deleteVariant(Number(req.params.id));
        if (!r.ok && r.reason === 'last') { return res.redirect(settingBack(req, '?error=tpl_last')); }
        res.redirect(settingBack(req, '?success=tpl'));
    } catch (err) {
        console.error('deleteEmailTemplate:', err.message);
        res.status(500).redirect(settingBack(req, '?error=tpl_save'));
    }
};

// Render de prueba/preview con shipment de ejemplo + variables custom (usa el catálogo real).
const sampleFill = async (s) => {
    const vars = { ...placeholders.buildVars(placeholders.sampleShipment()), ...await notificationVariableModel.getAllAsMap() };
    return placeholders.render(s, vars);
};

// Envía un email de prueba del template (sin persistir cambios) usando datos de ejemplo.
const sendTestTemplate = async (req, res) => {
    try {
        const { sendEmail } = require('../services/notification/emailSender');
        const to      = (req.body.testEmail || '').trim();
        const subject = (req.body.subject || '').trim();
        const body    = (req.body.body    || '').trim();
        const format  = req.body.format === 'html' ? 'html' : 'text';
        if (!isValidEmail(to)) { return res.status(400).json({ ok: false, error: 'Email de prueba inválido.' }); }
        if (!subject || !body) { return res.status(400).json({ ok: false, error: 'Asunto y cuerpo son obligatorios.' }); }

        // Envío de prueba: sí aplica el redirect test_email_override (es testeo, no flujo real).
        await sendEmail(to, `[PRUEBA] ${await sampleFill(subject)}`, await sampleFill(body), format, { allowOverride: true });
        res.json({ ok: true });
    } catch (err) {
        console.error('sendTestTemplate:', err.message);
        res.status(500).json({ ok: false, error: 'No se pudo enviar el email de prueba.' });
    }
};

// Prueba de notificaciones por email (PR68): envía a varios destinatarios usando
// el template de un evento (opcional) o un texto libre. Resuelve placeholders con
// datos de ejemplo + variables custom y encola los mails.
const testShipmentNotification = async (req, res) => {
    try {
        const recipients = String(req.body.emailRecipients || '')
            .split(',').map(e => e.trim()).filter(isValidEmail);
        if (recipients.length === 0) {
            return res.redirect(settingBack(req, '?error=test_notif_recipients'));
        }

        const eventCode = (req.body.shipmentEventCode || '').trim();
        let subject = 'Notificación de prueba — LogiTrack';
        let body    = (req.body.template || '').trim();
        let format  = 'text';

        if (eventCode) {
            const tpl = await emailTemplateModel.getDefaultByEventCode(eventCode);
            if (tpl) { subject = tpl.subject; body = body || tpl.body; format = tpl.format || 'text'; }
        }
        if (!body) {
            return res.redirect(settingBack(req, '?error=test_notif_empty'));
        }

        const subjectFilled = await sampleFill(subject);
        const bodyFilled    = await sampleFill(body);
        for (const recipient of recipients) {
            await queueEmail({ recipient, subject: subjectFilled, body: bodyFilled, format });
        }
        res.redirect(settingBack(req, '?success=test_notif'));
    } catch (err) {
        console.error('testShipmentNotification:', err.message);
        res.status(500).redirect(settingBack(req, '?error=test_notif'));
    }
};

// ===== Variables custom de notificación (ABM) =====
const VAR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const saveNotificationVariable = async (req, res) => {
    try {
        const { NotificationVariable } = notificationVariableModel;
        const id = req.params.id ? Number(req.params.id) : null;
        const key   = (req.body.key   || '').trim();
        const label = (req.body.label || '').trim();
        const value = (req.body.value || '');
        const description = (req.body.description || '').trim() || null;
        if (!label || !key) { return res.redirect(settingBack(req, '?error=var_empty')); }
        if (!VAR_KEY_RE.test(key)) { return res.redirect(settingBack(req, '?error=var_key')); }

        if (id) {
            const row = await notificationVariableModel.getById(id);
            if (!row) { return res.redirect(settingBack(req, '?error=var_not_found')); }
            await row.update({ key, label, value, description });
        } else {
            await NotificationVariable.create({ key, label, value, description });
        }
        res.redirect(settingBack(req, '?success=var'));
    } catch (err) {
        console.error('saveNotificationVariable:', err.message);
        res.status(500).redirect(settingBack(req, '?error=var_save'));
    }
};

const deleteNotificationVariable = async (req, res) => {
    try {
        const row = await notificationVariableModel.getById(Number(req.params.id));
        if (row) { await row.destroy(); }
        res.redirect(settingBack(req, '?success=var'));
    } catch (err) {
        console.error('deleteNotificationVariable:', err.message);
        res.status(500).redirect(settingBack(req, '?error=var_save'));
    }
};

// ===== Snippets / bloques de email (ABM) =====
const saveEmailSnippet = async (req, res) => {
    try {
        const { EmailSnippet } = emailSnippetModel;
        const id = req.params.id ? Number(req.params.id) : null;
        const label = (req.body.label || '').trim();
        const icon  = (req.body.icon  || '').trim() || null;
        const html  = (req.body.html  || '');
        const text  = (req.body.text  || '');
        if (!label) { return res.redirect(settingBack(req, '?error=snip_empty')); }

        if (id) {
            const row = await emailSnippetModel.getById(id);
            if (!row) { return res.redirect(settingBack(req, '?error=snip_not_found')); }
            // builtin: solo se editan textos/label/icon, no la key.
            await row.update({ label, icon, html, text });
        } else {
            const key = (req.body.key || '').trim() || ('snip_' + Date.now());
            if (!VAR_KEY_RE.test(key)) { return res.redirect(settingBack(req, '?error=snip_key')); }
            await EmailSnippet.create({ key, label, icon, html, text, builtin: false });
        }
        res.redirect(settingBack(req, '?success=snip'));
    } catch (err) {
        console.error('saveEmailSnippet:', err.message);
        res.status(500).redirect(settingBack(req, '?error=snip_save'));
    }
};

const deleteEmailSnippet = async (req, res) => {
    try {
        const row = await emailSnippetModel.getById(Number(req.params.id));
        if (row && row.builtin) { return res.redirect(settingBack(req, '?error=snip_builtin')); }
        if (row) { await row.destroy(); }
        res.redirect(settingBack(req, '?success=snip'));
    } catch (err) {
        console.error('deleteEmailSnippet:', err.message);
        res.status(500).redirect(settingBack(req, '?error=snip_save'));
    }
};

const saveTestEmailOverride = async (req, res) => {
    try {
        const value = (req.body.test_email_override || '').trim();
        if (value && !isValidEmail(value)) {
            return res.redirect(settingBack(req, '?error=override_invalid'));
        }
        const oldValue = await settingModel.get('test_email_override');
        await settingLogModel.logChange(res.locals.currentUser?.id, 'test_email_override', oldValue, value);
        await settingModel.set('test_email_override', value);
        res.redirect(settingBack(req, '?success=override'));
    } catch (err) {
        console.error('saveTestEmailOverride:', err.message);
        res.status(500).redirect(settingBack(req, '?error=override_save'));
    }
};

// LGT-173: guarda el color personalizado de cada estado de envío.
const saveStatusColors = async (req, res) => {
    try {
        const statuses = await statusModel.getAll();
        for (const s of statuses) {
            const key        = statusColors.keyFor(s.id);
            const useDefault = req.body[`default_${s.id}`] === 'on';
            // Checkbox "usar color del tema" tildado => se borra la personalización.
            const value = useDefault ? '' : (req.body[key] || '').trim();
            if (value && !statusColors.isValidHex(value)) {
                return res.redirect(settingBack(req, '?error=color_invalido'));
            }
            const oldValue = await settingModel.get(key);
            await settingLogModel.logChange(res.locals.currentUser?.id, key, oldValue, value);
            await settingModel.set(key, value);
        }
        res.redirect(settingBack(req, '?success=status_colors'));
    } catch (err) {
        console.error('saveStatusColors:', err.message);
        res.status(500).redirect(settingBack(req, '?error=status_colors_save'));
    }
};

// LGT-172: Identidad visual (nombre + logo institucional).
const saveIdentity = async (req, res) => {
    try {
        // El middleware logoUpload deja un error de validación en req.uploadError (formato/tamaño).
        if (req.uploadError) {
            return res.redirect(settingBack(req, '?error=logo_formato'));
        }

        const nombre = (req.body.nombre_empresa || '').trim();
        if (!nombre || nombre.length > 100) {
            return res.redirect(settingBack(req, '?error=nombre_empresa'));
        }

        const oldNombre = await settingModel.get('nombre_empresa');
        await settingLogModel.logChange(res.locals.currentUser?.id, 'nombre_empresa', oldNombre, nombre);
        await settingModel.set('nombre_empresa', nombre);

        // Logo opcional: si se subió un archivo válido, guardar su ruta pública y borrar el anterior.
        if (req.file) {
            const fs        = require('fs');
            const path      = require('path');
            const publicUrl = `/images/brand/${req.file.filename}`;
            const oldLogo   = await settingModel.get('logo_empresa');

            await settingLogModel.logChange(res.locals.currentUser?.id, 'logo_empresa', oldLogo, publicUrl);
            await settingModel.set('logo_empresa', publicUrl);

            // Limpieza del logo previo (solo si vivía en el directorio de marca).
            if (oldLogo && oldLogo.startsWith('/images/brand/')) {
                const oldPath = path.join(__dirname, '..', '..', 'public', oldLogo);
                fs.promises.unlink(oldPath).catch(() => { /* ya no existe */ });
            }
        }

        res.redirect(settingBack(req, '?success=identity'));
    } catch (err) {
        console.error('saveIdentity:', err.message);
        res.status(500).redirect(settingBack(req, '?error=identity_save'));
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

    if (!province) { return res.redirect(settingBack(req)); }

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

    res.redirect(settingBack(req, '?success=1'));
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
    res.redirect(settingBack(req, '?success=3'));
};

const assignBranch = async (req, res) => {
    const userIds = [].concat(req.body['userId[]'] || req.body.userId || []);
    const branchIds = [].concat(req.body['branchId[]'] || req.body.branchId || []);

    if (userIds.length === 0) { return res.redirect(settingBack(req)); }

    await Promise.all(
        userIds.map((uid, i) => {
            const userId = parseInt(uid);
            const branchId = branchIds[i] ? parseInt(branchIds[i]) : null;
            return userModel.update(userId, { branchId });
        })
    );

    res.redirect(settingBack(req, '?success=2'));
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
            // 'nombre_empresa' se gestiona en la tarjeta "Identidad visual" (/setting/identity) — LGT-172
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
            return res.redirect(settingBack(req, '?error=max_intentos'));
        }

        const diasExpiracion = parseInt(req.body.dias_expiracion_envio);
        if (isNaN(diasExpiracion) || diasExpiracion < 1 || diasExpiracion > 365) {
            return res.redirect(settingBack(req, '?error=dias_expiracion'));
        }
        const pesoMax = parseFloat(req.body.peso_maximo_envio);
        if (isNaN(pesoMax) || pesoMax < 1 || pesoMax > 999) {
            return res.redirect(settingBack(req, '?error=peso_maximo'));
        }

        const cantMax = parseInt(req.body.cantidad_maxima_paquetes);
        if (isNaN(cantMax) || cantMax < 1 || cantMax > 999) {
            return res.redirect(settingBack(req, '?error=cantidad_maxima'));
        }

        const costoBase = parseFloat(req.body.costo_base_envio);
        if (isNaN(costoBase) || costoBase < 0) {
            return res.redirect(settingBack(req, '?error=costo_base'));
        }

        const horaInicio = req.body.horario_entrega_inicio;
        const horaFin = req.body.horario_entrega_fin;
        if (horaInicio >= horaFin) {
            return res.redirect(settingBack(req, '?error=horario'));
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
        res.redirect(settingBack(req, '?success=4'));
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
        res.redirect(settingBack(req, '?success=failed_reason'));
    } catch (err) {
        console.error('saveFailedReason:', err.message);
        res.redirect(settingBack(req, '?error=failed_reason'));
    }
};

const saveStandardMessage = async (req, res) => {
    try {
        const { code } = req.params;
        const body = (req.body.body || '').trim();
        if (!code || !body) { return res.redirect(settingBack(req, '?error=std_msg_empty')); }
        const updated = await standardMessageModel.updateByCode(code, body);
        if (!updated) { return res.redirect(settingBack(req, '?error=std_msg_not_found')); }
        res.redirect(settingBack(req, '?success=std_msg'));
    } catch (err) {
        console.error('saveStandardMessage:', err.message);
        res.redirect(settingBack(req, '?error=std_msg'));
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
        res.redirect(settingBack(req, '?success=time_window'));
    } catch (err) {
        console.error('saveTimeWindow:', err.message);
        res.redirect(settingBack(req, '?error=time_window'));
    }
};

const saveIncidentType = async (req, res) => {
    try {
        const { IncidentType } = require('../models/incidentType');
        const { id } = req.params;
        if (!IncidentType) { return res.redirect(settingBack(req, '?error=inc_type_model')); }
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
        res.redirect(settingBack(req, '?success=inc_type'));
    } catch (err) {
        console.error('saveIncidentType:', err.message);
        res.redirect(settingBack(req, '?error=inc_type'));
    }
};

const saveIncidentNotifConfig = async (req, res) => {
    try {
        await incidentNotifConfig.set({
            notifySupervisorBranch:  req.body.notifySupervisorBranch  === 'on',
            notifyAssignedOperator:  req.body.notifyAssignedOperator  === 'on',
            notifyAdmins:            req.body.notifyAdmins            === 'on',
            notifyReporter:          req.body.notifyReporter          === 'on',
            notifyShipmentRecipient: req.body.notifyShipmentRecipient === 'on',
            customEmails:            req.body.customEmails || ''
        });
        res.redirect(settingBack(req, '?success=incident_notif'));
    } catch (err) {
        console.error('saveIncidentNotifConfig:', err.message);
        res.status(500).redirect(settingBack(req, '?error=incident_notif'));
    }
};

module.exports = {
    getSettings, saveSettings, assignBranch, saveRouteOptimizerSettings, getRouteOptimizerSettings,
    saveParams, saveIdentity, saveNotificationConfig, saveEmailTemplate, sendTestTemplate, saveTestEmailOverride,
    updateEmailTemplateById, createEmailTemplateVariant, setDefaultEmailTemplate, deleteEmailTemplate,
    saveNotificationVariable, deleteNotificationVariable, saveEmailSnippet, deleteEmailSnippet,
    saveFailedReason, saveStandardMessage, saveTimeWindow, saveIncidentType,
    saveIncidentNotifConfig, testShipmentNotification, saveStatusColors,
};
