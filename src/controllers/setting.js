const settingModel = require('../models/setting');
const provinceModel = require('../models/province');
const branchModel = require('../models/branch');
const userModel = require('../models/user');
const { PROVINCES } = require('../utils/provinces');
const NotificationConfigModel = require('../models/notificationConfig');
const { NotificationEvent } = require('../constants/enums');

const getSettings = async (req, res) => {
    const [settings, provinces, branches, users, routeOpt, notifConfig] = await Promise.all([
        settingModel.getAll(),
        provinceModel.getAll(),
        branchModel.getAll(),
        userModel.getAll(),
        getRouteOptimizerSettings(),
        NotificationConfigModel.getAllConfigs()
    ]);


    if (!settings.origin_province_id) { settings.origin_province_id = '24'; }

    res.render('setting/index', {
        settings, notifConfig, provinces, branches, users, routeOpt,
        params: {
            max_intentos_fallidos: settings.max_intentos_fallidos || '3',
            dias_expiracion_envio: settings.dias_expiracion_envio || '30',
            notificaciones_activas: settings.notificaciones_activas || 'true',
            horario_entrega_inicio: settings.horario_entrega_inicio || '08:00',
            horario_entrega_fin: settings.horario_entrega_fin || '20:00',
        }
    });
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

        const horaInicio = req.body.horario_entrega_inicio;
        const horaFin = req.body.horario_entrega_fin;
        if (horaInicio >= horaFin) {
            return res.redirect('/setting?error=horario');
        }

        await Promise.all(params.map(key => {
            let value;
            if (key === 'notificaciones_activas') {
                value = req.body[key] === 'true' ? 'true' : 'false';
            } else {
                value = req.body[key] || '';
            }
            return settingModel.set(key, value);
        }));

        // 1. Obtenemos todas las configuraciones actuales
        const notifyConfigs = await NotificationConfigModel.getAllConfigs();

        // 2. Extraemos los códigos de los checkboxes que vienen en el body
        // El body trae algo como { "cbox-SHIPMENT_PENDING": "on", ... }
        const body = req.body;

        // 3. Iteramos las configuraciones de la base de datos
        for (const config of notifyConfigs) {
            // Construimos el nombre del campo tal cual viene del formulario
            const checkboxName = `cbox_${config.eventCode}`;

            // Determinamos si debería estar habilitado (si existe en el body y es 'on')
            const shouldBeEnabled = body[checkboxName] === 'on';

            // 4. Solo actualizamos si el valor cambió para ahorrar recursos en la BD
            if (config.enabled !== shouldBeEnabled) {
                await NotificationConfigModel.NotificationConfig.update(
                    { enabled: shouldBeEnabled },
                    { where: { id: config.id } }
                );
            }
        }


        res.redirect('/setting?success=4');
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};

module.exports = { getSettings, saveSettings, assignBranch, saveRouteOptimizerSettings, getRouteOptimizerSettings, saveParams };
