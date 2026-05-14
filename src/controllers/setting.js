const settingModel  = require('../models/setting');
const provinceModel = require('../models/province');
const branchModel   = require('../models/branch');
const userModel     = require('../models/user');
const { PROVINCES } = require('../utils/provinces');

const getSettings = async (req, res) => {
    const [settings, provinces, branches, users, routeOpt] = await Promise.all([
        settingModel.getAll(),
        provinceModel.getAll(),
        branchModel.getAll(),
        userModel.getAll(),
        getRouteOptimizerSettings(),
    ]);

    if (!settings.origin_province_id) { settings.origin_province_id = '24'; }

    res.render('setting/index', { settings, provinces, branches, users, routeOpt });
};

const GEOREF = 'https://apis.datos.gob.ar/georef/api';

async function geocodeOrigin(street, number, province) {
    try {
        const query = `${street} ${number}`;
        const url   = `${GEOREF}/direcciones?direccion=${encodeURIComponent(query)}&provincia=${province.indec}&max=1&campos=estandar`;
        const resp  = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data  = await resp.json();
        const item  = (data.direcciones || [])[0];
        if (item?.ubicacion?.lat) {
            return { lat: item.ubicacion.lat, lng: item.ubicacion.lon };
        }
    } catch { /* usa centroide como fallback */ }
    return null;
}

const saveSettings = async (req, res) => {
    const { origin_province_id, origin_street, origin_number, origin_postal_code } = req.body;
    const provinceId = parseInt(origin_province_id);
    const province   = PROVINCES[provinceId];

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
        settingModel.set('origin_province_id',  String(provinceId)),
        settingModel.set('origin_province_ml',  province.ml),
        settingModel.set('origin_lat',          String(lat)),
        settingModel.set('origin_lng',          String(lng)),
        settingModel.set('origin_street',       street),
        settingModel.set('origin_number',       number),
        settingModel.set('origin_postal_code',  (origin_postal_code || '').trim()),
    ]);

    res.redirect('/setting?success=1');
};

const ROUTE_SETTINGS = {
    piggyback_enabled:           { default: 'false', parse: v => v === 'true' || v === 'on' || v === '1' },
    piggyback_max_extra_pct:     { default: '15',    parse: v => Math.max(0, Number(v) || 0) },
    piggyback_max_extra_km:      { default: '30',    parse: v => Math.max(0, Number(v) || 0) },
    piggyback_max_extra_cost_pct:{ default: '20',    parse: v => Math.max(0, Number(v) || 0) },
    urgent_combine_enabled:      { default: 'true',  parse: v => v === 'true' || v === 'on' || v === '1' },
    urgent_combine_max_km:       { default: '15',    parse: v => Math.max(0, Number(v) || 0) },
    cluster_merge_radius_km:     { default: '60',    parse: v => Math.max(0, Number(v) || 0) },
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
    const piggyEnabled  = body.piggyback_enabled === 'on'      || body.piggyback_enabled === 'true'      || body.piggyback_enabled === '1';
    const urgentEnabled = body.urgent_combine_enabled === 'on' || body.urgent_combine_enabled === 'true' || body.urgent_combine_enabled === '1';
    await Promise.all([
        settingModel.set('piggyback_enabled',            piggyEnabled ? 'true' : 'false'),
        settingModel.set('piggyback_max_extra_pct',      String(Math.max(0, Number(body.piggyback_max_extra_pct) || 0))),
        settingModel.set('piggyback_max_extra_km',       String(Math.max(0, Number(body.piggyback_max_extra_km) || 0))),
        settingModel.set('piggyback_max_extra_cost_pct', String(Math.max(0, Number(body.piggyback_max_extra_cost_pct) || 0))),
        settingModel.set('urgent_combine_enabled',       urgentEnabled ? 'true' : 'false'),
        settingModel.set('urgent_combine_max_km',        String(Math.max(0, Number(body.urgent_combine_max_km) || 0))),
        settingModel.set('cluster_merge_radius_km',      String(Math.max(0, Number(body.cluster_merge_radius_km) || 0))),
    ]);
    res.redirect('/setting?success=3');
};

const assignBranch = async (req, res) => {
    const userIds   = [].concat(req.body['userId[]']   || req.body.userId   || []);
    const branchIds = [].concat(req.body['branchId[]'] || req.body.branchId || []);

    if (userIds.length === 0) { return res.redirect('/setting'); }

    await Promise.all(
        userIds.map((uid, i) => {
            const userId   = parseInt(uid);
            const branchId = branchIds[i] ? parseInt(branchIds[i]) : null;
            return userModel.update(userId, { branchId });
        })
    );

    res.redirect('/setting?success=2');
};

module.exports = { getSettings, saveSettings, assignBranch, saveRouteOptimizerSettings, getRouteOptimizerSettings };
