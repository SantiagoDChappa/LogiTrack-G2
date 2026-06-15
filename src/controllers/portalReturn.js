// LGT-182 — solicitud de devolución desde el portal del cliente.
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const { assertClientOwnsShipment } = require('../services/portalClientAccess');
const returnService = require('../services/returnService');
const { ReturnReason, ReturnReasonLabel } = require('../constants/enums');

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
            windowDays: elig.windowDays,
            form: req.body,
            error: result.message,
        });
    }

    res.render('portal/misEnviosReturnSuccess', {
        support: await getSupportInfo(),
        shipment: shipment.toJSON ? shipment.toJSON() : shipment,
        returnId: result.returnId,
    });
};

module.exports = { getReturnForm, postReturn };
