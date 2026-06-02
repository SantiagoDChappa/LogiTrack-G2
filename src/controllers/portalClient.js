const settingModel = require('../models/setting');
const shipmentModel = require('../models/shipment');
const {
    COOKIE_NAME,
    parseDocument,
    assertClientOwnsShipment,
    requestAccess,
    confirmAccess,
    splitActiveHistorical,
} = require('../services/portalClientAccess');
const { enrichShipmentRecord, canSelfService } = require('../services/portalShipmentView');

const getSupportInfo = async () => {
    const [nombreEmpresa, telefonoSoporte, emailSoporte] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('telefono_soporte'),
        settingModel.get('email_soporte'),
    ]);
    return {
        nombre: nombreEmpresa || 'LogiTrack',
        telefono: telefonoSoporte || '0800-555-5678',
        email: emailSoporte || 'soporte@logitrack.com',
        hours: 'Lunes a viernes, 9 a 18 hs',
    };
};

const renderIdentify = async (req, res, extra = {}) => {
    const support = await getSupportInfo();
    res.render('portal/misEnviosIdentify', {
        support,
        form: extra.form || {},
        error: extra.error || null,
        info: extra.info || null,
    });
};

const getIdentifyForm = async (req, res) => {
    if (res.locals.portalClient) {
        return res.redirect('/portal/mis-envios/lista');
    }
    return renderIdentify(req, res);
};

const postRequestAccess = async (req, res) => {
    const document = req.body.document;
    const email = req.body.email;
    const result = await requestAccess({ document, email });

    if (!result.ok) {
        if (result.code === 'no_shipments') {
            return renderIdentify(req, res, {
                error: result.message,
                form: { document, email },
            });
        }
        return renderIdentify(req, res, {
            error: result.message,
            form: { document, email },
        });
    }

    return res.render('portal/misEnviosPending', {
        support: await getSupportInfo(),
        email: result.pending.email,
        expiresAt: result.pending.expiresAt,
        mailDelivered: result.pending.mailDelivered,
        devLink: result.pending.devLink,
    });
};

const getConfirmAccess = async (req, res) => {
    const result = await confirmAccess(req.query.token);
    if (!result.ok) {
        return res.status(result.status).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: result.message,
        });
    }

    res.cookie(COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
    });

    return res.redirect('/portal/mis-envios/lista');
};

const getShipmentList = async (req, res) => {
    const { document, email } = res.locals.portalClient;
    const shipments = await shipmentModel.findByClientIdentity({ document, email });
    const { active, historical } = splitActiveHistorical(shipments);

    res.render('portal/misEnviosList', {
        support: await getSupportInfo(),
        client: { document, email },
        active,
        historical,
        tab: req.query.tab === 'historical' ? 'historical' : 'active',
    });
};

const getShipmentDetail = async (req, res) => {
    const shipmentId = Number(req.params.id);
    if (!shipmentId) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment || !assertClientOwnsShipment(shipment, res.locals.portalClient)) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const enriched = await enrichShipmentRecord(shipment);

    res.render('portal/misEnviosDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        shipment: enriched,
        canSelfService: canSelfService(enriched),
    });
};

const postLogout = (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.redirect('/portal/mis-envios');
};

module.exports = {
    getIdentifyForm,
    postRequestAccess,
    getConfirmAccess,
    getShipmentList,
    getShipmentDetail,
    postLogout,
};
