// LGT-182 — solicitud de devolución desde el portal del cliente.
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const { Branch } = require('../models/branch');
const { assertClientOwnsShipment } = require('../services/portalClientAccess');
const returnService = require('../services/returnService');
const { ReturnReason, ReturnReasonLabel, ReturnStatusLabel } = require('../constants/enums');

// Sucursales habilitadas para entrega de devolución en sucursal (LGT-184).
const getPickupBranches = () => Branch.findAll({ where: { pickupEnabled: true, closed: false } });

const getSupportInfo = async () => {
    const [nombreEmpresa, telefonoSoporte, emailSoporte] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('telefono_soporte'),
        settingModel.get('email_soporte'),
    ]);
    return { nombreEmpresa: nombreEmpresa || 'LogiTrack', telefonoSoporte, emailSoporte };
};

const REASON_OPTIONS = Object.values(ReturnReason).map((code) => ({ code, label: ReturnReasonLabel[code] }));

const loadOwned = async (req, res, shipmentId) => {
    if (!shipmentId) { return null; }
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment || !assertClientOwnsShipment(shipment, res.locals.portalClient)) { return null; }
    return shipment;
};

const notFound = async (res) =>
    res.status(404).render('portal/misEnviosConfirmError', {
        support: await getSupportInfo(),
        error: 'Envío no encontrado.',
    });

const getReturnForm = async (req, res) => {
    const shipment = await loadOwned(req, res, Number(req.params.id));
    if (!shipment) { return notFound(res); }

    const elig = await returnService.checkEligibility(shipment);
    if (!elig.ok) {
        // No elegible: vuelve al detalle con el motivo (Esc.5/6).
        return res.redirect(`/portal/mis-envios/envio/${shipment.id}?returnError=${encodeURIComponent(elig.error)}`);
    }

    res.render('portal/misEnviosReturnNew', {
        support: await getSupportInfo(),
        shipment: shipment.toJSON ? shipment.toJSON() : shipment,
        reasons: REASON_OPTIONS,
        branches: await getPickupBranches(),
        windowDays: elig.windowDays,
        form: {},
        error: null,
    });
};

const postReturn = async (req, res) => {
    const shipment = await loadOwned(req, res, Number(req.params.id));
    if (!shipment) { return notFound(res); }

    const result = await returnService.createReturn({
        shipment,
        client: res.locals.portalClient,
        body: req.body,
    });

    if (!result.ok) {
        const elig = await returnService.checkEligibility(shipment);
        return res.status(result.status || 400).render('portal/misEnviosReturnNew', {
            support: await getSupportInfo(),
            shipment: shipment.toJSON ? shipment.toJSON() : shipment,
            reasons: REASON_OPTIONS,
            branches: await getPickupBranches(),
            windowDays: elig.windowDays,
            form: req.body,
            error: result.message,
        });
    }

    res.render('portal/misEnviosReturnSuccess', {
        support: await getSupportInfo(),
        shipment: shipment.toJSON ? shipment.toJSON() : shipment,
        returnId: result.returnId,
        modeLabel: req.body.deliveryMode === 'branch' ? 'Entrega en sucursal' : 'Retiro a domicilio',
    });
};

// LGT-186 — seguimiento: listado de devoluciones del cliente (identidad validada).
const listReturns = async (req, res) => {
    const { document, email } = res.locals.portalClient;
    const shipments = await shipmentModel.findByClientIdentity({ document, email });
    const ids = shipments.map((s) => s.id);
    const rows = await returnService.listForShipmentIds(ids);
    const returns = rows.map((r) => ({
        id: r.id,
        trackingId: r.shipment ? r.shipment.trackingId : '—',
        status: r.status,
        statusLabel: ReturnStatusLabel[r.status] || r.status,
        reasonLabel: ReturnReasonLabel[r.reason] || r.reason,
        createdAt: r.createdAt,
    }));
    res.render('portal/misEnviosReturnsList', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        returns,
    });
};

// LGT-186 — detalle + historial cronológico de una devolución propia.
const returnDetail = async (req, res) => {
    const id = Number(req.params.id);
    const ret = await returnService.findByIdWithHistory(id);
    if (!ret) { return notFound(res); }

    // Aislamiento: la devolución debe ser de un envío de la identidad validada.
    const shipment = await loadOwned(req, res, ret.shipmentId);
    if (!shipment) { return notFound(res); }

    res.render('portal/misEnviosReturnDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        ret,
        ReturnStatusLabel,
        ReturnReasonLabel,
    });
};

module.exports = { getReturnForm, postReturn, listReturns, returnDetail };
