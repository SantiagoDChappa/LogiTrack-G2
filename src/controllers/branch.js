// ABM de sucursales (solo admin). La ubicación (lat/long) se geocodifica desde la
// dirección reusando el servicio de geocodificación existente. La "baja" es lógica
// (closed = true) para no romper envíos / usuarios / rutas que referencian la sucursal.
const branchModel = require('../models/branch');
const provinceModel = require('../models/province');
const { geocodeAddress } = require('../services/geocode');

const splitAddress = (address) => {
    const parts = String(address || '').trim().split(/\s+/);
    let number = '';
    if (parts.length > 1 && /\d/.test(parts[parts.length - 1])) { number = parts.pop(); }
    return { street: parts.join(' '), number };
};

// Valida el form y geocodifica. Devuelve { data } o { error }.
const buildFromForm = async (form) => {
    const name = String(form.name || '').trim();
    const street = String(form.street || '').trim();
    const number = String(form.number || '').trim();
    const provinceId = Number(form.provinceId);
    if (!name || !street || !number || !provinceId) {
        return { error: 'Completá nombre, calle, número y provincia.' };
    }
    let geo;
    try { geo = await geocodeAddress({ street, number, provinceId }); }
    catch (e) { return { error: 'No se pudo ubicar la dirección: ' + e.message }; }
    if (!geo.lat || !geo.lng) { return { error: 'No se encontró la ubicación de esa dirección.' }; }
    return {
        data: {
            name, provinceId,
            address: `${street} ${number}`,
            postalCode: String(form.postalCode || '').trim() || geo.postalCode || '0000',
            phone: String(form.phone || '').trim() || null,
            latitude: geo.lat, longitude: geo.lng,
            pickupEnabled: form.pickupEnabled === 'on' || form.pickupEnabled === 'true',
        },
    };
};

const getIndex = async (req, res) => {
    res.render('branch/index', { branches: await branchModel.getAll(), ok: req.query.ok || null });
};

const getNewForm = async (req, res) => {
    res.render('branch/new', { provinces: await provinceModel.getAll(), f: {}, error: null });
};

const create = async (req, res) => {
    const built = await buildFromForm(req.body);
    if (built.error) {
        return res.status(400).render('branch/new', { provinces: await provinceModel.getAll(), f: req.body, error: built.error });
    }
    await branchModel.create({ ...built.data, closed: false });
    res.redirect('/branch?ok=created');
};

const getEditForm = async (req, res) => {
    const [branch, provinces] = await Promise.all([branchModel.getById(req.params.id), provinceModel.getAll()]);
    if (!branch) { return res.status(404).render('error', { message: 'Sucursal no encontrada' }); }
    const { street, number } = splitAddress(branch.address);
    const f = {
        id: branch.id, name: branch.name, street, number,
        provinceId: branch.provinceId, postalCode: branch.postalCode,
        phone: branch.phone, pickupEnabled: branch.pickupEnabled,
    };
    res.render('branch/update', { provinces, f, error: null });
};

const update = async (req, res) => {
    const id = req.params.id;
    const branch = await branchModel.getById(id);
    if (!branch) { return res.status(404).render('error', { message: 'Sucursal no encontrada' }); }
    const built = await buildFromForm(req.body);
    if (built.error) {
        return res.status(400).render('branch/update', { provinces: await provinceModel.getAll(), f: { ...req.body, id }, error: built.error });
    }
    await branchModel.update(id, built.data);
    res.redirect('/branch?ok=updated');
};

const setClosed = async (req, res) => {
    const closed = req.body.closed === 'true' || req.body.closed === 'on';
    await branchModel.setClosed(req.params.id, closed);
    res.redirect('/branch?ok=' + (closed ? 'closed' : 'reopened'));
};

// ── Retiro en sucursal: pantalla del operador para confirmar entregas con QR/código ──
const getPickupScanner = async (req, res) => {
    res.render('branch/pickup', {
        result: null,
        error: null,
        currentUser: res.locals.currentUser,
    });
};

const postPickupConfirm = async (req, res) => {
    const pickupService = require('../services/pickupCode.service');
    const value = req.body.value || req.body.code || '';
    const wantsJson = (req.get('accept') || '').includes('application/json') || req.xhr;
    try {
        const shipment = await pickupService.confirmPickup(value, res.locals.currentUser);
        const payload = {
            ok: true,
            trackingId: shipment.trackingId,
            recipientName: shipment.recipient?.fullName || '',
            branchName: shipment.currentBranch?.name || '',
        };
        if (wantsJson) { return res.json(payload); }
        return res.render('branch/pickup', { result: payload, error: null, currentUser: res.locals.currentUser });
    } catch (e) {
        const msg = e.code ? e.message : 'No se pudo confirmar el retiro.';
        if (wantsJson) { return res.status(e.code === 'NOT_FOUND' ? 404 : 422).json({ ok: false, error: msg, code: e.code }); }
        return res.status(422).render('branch/pickup', { result: null, error: msg, currentUser: res.locals.currentUser });
    }
};

module.exports = { getIndex, getNewForm, create, getEditForm, update, setClosed, getPickupScanner, postPickupConfirm };
