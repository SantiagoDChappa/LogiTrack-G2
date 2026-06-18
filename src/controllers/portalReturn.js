// LGT-182 — solicitud de devolución desde el portal del cliente. La devolución es una
// incidencia de tipo RETURN (returnIncidentService); el seguimiento y el detalle viven
// en "Mis incidencias" del portal.
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const { assertClientOwnsShipment } = require('../services/portalClientAccess');
const returnIncidentService = require('../services/returnIncidentService');
const { ReturnReason, ReturnReasonLabel } = require('../constants/enums');

const getSupportInfo = async () => {
    const [nombreEmpresa, telefonoSoporte, emailSoporte] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('telefono_soporte'),
        settingModel.get('email_soporte'),
    ]);
    return {
        nombre:   nombreEmpresa  || 'LogiTrack',
        telefono: telefonoSoporte || '0800-555-5678',
        email:    emailSoporte    || 'soporte@logitrack.com',
        hours:    'Lunes a viernes, 9 a 18 hs',
    };
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

    const elig = await returnIncidentService.checkEligibility(shipment);
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

    // El portal identifica al cliente por documento+email. Resolvemos la Person por
    // documento para poblar reporter/openedByPerson de la incidencia (best-effort; puede
    // quedar null si no hay Person con ese documento).
    const pc = res.locals.portalClient;
    const person = await require('../models/person').findByDocument(pc.document).catch(() => null);
    const client = { email: pc.email, fullName: person ? person.fullName : null, personId: person ? person.id : null };

    const result = await returnIncidentService.createReturn({ shipment, client, body: req.body });

    if (!result.ok) {
        const elig = await returnIncidentService.checkEligibility(shipment);
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
        incidentId: result.incidentId,
    });
};

// LGT-186 — listado de devoluciones del cliente (incidencias RETURN de sus envíos).
const listReturns = async (req, res) => {
    const { document, email } = res.locals.portalClient;
    const shipments = await shipmentModel.findByClientIdentity({ document, email });
    const ids = shipments.map((s) => s.id);
    const rows = await returnIncidentService.listForShipmentIds(ids);
    const returns = rows.map((r) => ({
        id: r.id,
        trackingId: r.shipment ? r.shipment.trackingId : '—',
        status: r.status,
        statusLabel: returnIncidentService.portalStatusLabel(r),
        reasonLabel: ReturnReasonLabel[r.returnReason] || r.returnReason || 'Devolución',
        createdAt: r.createdAt,
    }));
    res.render('portal/misEnviosReturnsList', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        returns,
    });
};

// LGT-186 — el detalle (y el historial) de la devolución es el de su incidencia.
const returnDetail = (req, res) =>
    res.redirect(`/portal/mis-envios/incidencia/${Number(req.params.id)}`);

// La modalidad de devolución se discontinuó (devolución = reclamo + reembolso, sin
// gestionar el retorno físico). La ruta permanece por compatibilidad y redirige.
const postEditModality = (req, res) =>
    res.redirect(`/portal/mis-envios/incidencia/${Number(req.params.id)}`);

// LGT-214 — comprobante de nota de crédito accesible desde el portal del cliente.
// Aislamiento: verifica que la NC pertenezca a un envío propio de la identidad validada.
const returnCreditNote = async (req, res) => {
    const cnService = require('../services/creditNoteService');
    const costSvc   = require('../services/shipmentCostService');

    const cn = await cnService.getById(Number(req.params.id));
    if (!cn) { return notFound(res); }

    // Aislamiento: el envío asociado a la NC debe pertenecer al cliente autenticado.
    const shipment = await loadOwned(req, res, cn.shipmentId);
    if (!shipment) { return notFound(res); }

    const breakdown = await costSvc.computeCost(shipment);
    const empresa   = (await settingModel.get('nombre_empresa')) || 'LogiTrack';

    res.render('portal/misEnviosReturnCreditNote', {
        support: await getSupportInfo(),
        cn,
        shipment: shipment.toJSON ? shipment.toJSON() : shipment,
        breakdown,
        empresa,
    });
};

module.exports = { getReturnForm, postReturn, listReturns, returnDetail, postEditModality, returnCreditNote };
