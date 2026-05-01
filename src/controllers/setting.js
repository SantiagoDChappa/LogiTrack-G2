const settingModel  = require('../models/setting');
const provinceModel = require('../models/province');
const branchModel   = require('../models/branch');
const userModel     = require('../models/user');
const { PROVINCES } = require('../utils/provinces');

const getSettings = async (req, res) => {
    const [settings, provinces, branches, users] = await Promise.all([
        settingModel.getAll(),
        provinceModel.getAll(),
        branchModel.getAll(),
        userModel.search({ roleId: 1 }),
    ]);

    if (!settings.origin_province_id) { settings.origin_province_id = '24'; }

    res.render('setting/index', { settings, provinces, branches, users });
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

const assignBranch = async (req, res) => {
    const userId   = parseInt(req.body.userId);
    const branchId = req.body.branchId ? parseInt(req.body.branchId) : null;

    if (!userId) { return res.redirect('/setting'); }

    await userModel.update(userId, { branchId });
    res.redirect('/setting?success=2');
};

module.exports = { getSettings, saveSettings, assignBranch };
