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
const {
    canModifyShipment,
    submitPortalModification,
    listByShipment,
    changeTypeLabel,
    statusLabel,
    describeChanges,
} = require('../services/portalModificationService');
const { Branch } = require('../models/branch');
const provinceModel = require('../models/province');
const {
    listClientIncidents,
    loadIncidentDetailViewModel,
    loadOwnedIncident,
} = require('../services/portalIncidentView');
const { submitClientResponse } = require('../services/portalIncidentResponseService');
const incidentAttachmentModel = require('../models/incidentAttachment');
const {
    getEligibleShipments,
    isEligible,
    submitSurvey,
    getCompletedSurvey: getCompletedDeliverySurvey,
} = require('../services/portalSurveyService');
const {
    getEligibleIncidents,
    isEligible: isIncidentSurveyEligible,
    submitSurvey: submitIncidentSurvey,
} = require('../services/portalIncidentSurveyService');

const formatModificationsList = (rows) => rows.map((row) => {
    const json = typeof row.toJSON === 'function' ? row.toJSON() : row;
    return {
        id: json.id,
        createdAt: json.createdAt,
        changeType: json.changeType,
        status: json.status,
        typeLabel: changeTypeLabel(json.changeType),
        statusLabel: statusLabel(json.status),
        statusKey: String(json.status || '').toLowerCase().replace(/_/g, '-'),
        summary: describeChanges(json.payload?.requested || {}),
    };
});

const loadOwnedShipment = async (req, res, shipmentId) => {
    if (!shipmentId) { return null; }
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment || !assertClientOwnsShipment(shipment, res.locals.portalClient)) {
        return null;
    }
    return shipment;
};

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
    const modifications = formatModificationsList(await listByShipment(shipmentId));

    res.render('portal/misEnviosDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        shipment: enriched,
        canSelfService: canSelfService(enriched),
        modifications,
    });
};

const getManageForm = async (req, res) => {
    const shipmentId = Number(req.params.id);
    const shipment = await loadOwnedShipment(req, res, shipmentId);
    if (!shipment) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const json = shipment.toJSON ? shipment.toJSON() : shipment;
    const [timeWindows, branches, provinces] = await Promise.all([
        require('../models/deliveryTimeWindow').getActive(),
        Branch.findAll({ where: { pickupEnabled: true, closed: false } }),
        provinceModel.getAll(),
    ]);

    res.render('portal/misEnviosManage', {
        support: await getSupportInfo(),
        shipment: json,
        timeWindows,
        branches,
        provinces,
        editable: canModifyShipment(shipment),
        error: null,
    });
};

const postManageForm = async (req, res) => {
    const shipmentId = Number(req.params.id);
    const shipment = await loadOwnedShipment(req, res, shipmentId);
    if (!shipment) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const result = await submitPortalModification({
        shipment,
        client: res.locals.portalClient,
        body: req.body,
    });

    if (!result.ok) {
        const json = shipment.toJSON ? shipment.toJSON() : shipment;
        const [timeWindows, branches, provinces] = await Promise.all([
            require('../models/deliveryTimeWindow').getActive(),
            Branch.findAll({ where: { pickupEnabled: true, closed: false } }),
            provinceModel.getAll(),
        ]);
        return res.status(result.status).render('portal/misEnviosManage', {
            support: await getSupportInfo(),
            shipment: json,
            timeWindows,
            branches,
            provinces,
            editable: canModifyShipment(shipment),
            error: result.message,
        });
    }

    return res.render('portal/misEnviosManageResult', {
        support: await getSupportInfo(),
        shipmentId: result.shipmentId,
        trackingId: result.trackingId,
        applied: result.applied,
        pending: result.pending,
    });
};

const postLogout = (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.redirect('/portal/mis-envios');
};

const getIncidentList = async (req, res) => {
    const { open, closed } = await listClientIncidents(res.locals.portalClient);
    const tab = req.query.tab === 'closed' ? 'closed' : 'open';

    res.render('portal/misEnviosIncidentsList', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        open,
        closed,
        tab,
    });
};

const getIncidentDetail = async (req, res) => {
    const incidentId = Number(req.params.id);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Incidencia no encontrada.',
        });
    }

    res.render('portal/misEnviosIncidentDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        incident: await loadIncidentDetailViewModel(incident),
        flash: req.query.ok === '1' ? 'Tu respuesta fue enviada correctamente.' : null,
        error: req.query.error ? String(req.query.error) : null,
    });
};

const postIncidentResponse = async (req, res) => {
    const incidentId = Number(req.params.id);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Incidencia no encontrada.',
        });
    }

    if (req.uploadError) {
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?error=${encodeURIComponent(req.uploadError)}`);
    }

    const result = await submitClientResponse({
        incident,
        client: res.locals.portalClient,
        comment: req.body.comment,
        file: req.file,
    });

    if (!result.ok) {
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?error=${encodeURIComponent(result.message)}`);
    }

    return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?ok=1`);
};

const getIncidentAttachment = async (req, res) => {
    const incidentId = Number(req.params.id);
    const attId = Number(req.params.attId);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        return res.status(404).send('Incidencia no encontrada.');
    }

    const att = await incidentAttachmentModel.getById(attId);
    if (!att || att.incidentId !== incidentId) {
        return res.status(404).send('Archivo no encontrado.');
    }

    const buffer = Buffer.from(att.dataBase64, 'base64');
    res.setHeader('Content-Disposition', `inline; filename="${String(att.fileName).replace(/"/g, '')}"`);
    return res.type(att.mimeType).send(buffer);
};

const getSurveyList = async (req, res) => {
    const { pending, completed } = await getEligibleShipments(res.locals.portalClient);
    const tab = req.query.tab === 'completed' ? 'completed' : 'pending';

    res.render('portal/misEnviosSurveyList', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        pending,
        completed,
        tab,
    });
};

const getSurveyForm = async (req, res) => {
    const shipmentId = Number(req.params.shipmentId);
    const check = await isEligible(shipmentId, res.locals.portalClient);

    if (check.reason === 'not_found' || check.reason === 'not_owner') {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    if (check.reason === 'not_terminal') {
        return res.status(400).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'El envío aún no finalizó su gestión.',
        });
    }

    const survey = check.reason === 'already_answered' ? check.survey : null;
    const shipment = check.shipment || await require('../models/shipment').getById(shipmentId);
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;

    res.render('portal/misEnviosSurveyForm', {
        support: await getSupportInfo(),
        shipment: {
            id: json.id,
            trackingId: json.trackingId,
            recipientName: json.recipient?.fullName || '-',
        },
        survey,
        flash: req.query.ok === '1' ? 'Tu encuesta fue registrada correctamente.' : null,
        error: req.query.error ? String(req.query.error) : null,
    });
};

const postSurvey = async (req, res) => {
    const shipmentId = Number(req.params.shipmentId);
    const result = await submitSurvey(shipmentId, res.locals.portalClient, req.body);

    if (!result.ok) {
        return res.redirect(`/portal/mis-envios/encuesta/${shipmentId}?error=${encodeURIComponent(result.message)}`);
    }

    return res.redirect(`/portal/mis-envios/encuesta/${shipmentId}?ok=1`);
};

const getIncidentSurveyList = async (req, res) => {
    const { pending, completed } = await getEligibleIncidents(res.locals.portalClient);
    const tab = req.query.tab === 'completed' ? 'completed' : 'pending';

    res.render('portal/misEnviosIncidentSurveyList', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        pending,
        completed,
        tab,
    });
};

const getIncidentSurveyForm = async (req, res) => {
    const incidentId = Number(req.params.incidentId);
    const check = await isIncidentSurveyEligible(incidentId, res.locals.portalClient);

    if (check.reason === 'not_found' || check.reason === 'not_owner') {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Incidencia no encontrada.',
        });
    }

    if (check.reason === 'not_closed') {
        return res.status(400).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'La incidencia aún no fue resuelta.',
        });
    }

    const survey = check.reason === 'already_answered' ? check.survey : null;
    const incident = check.incident || await require('../models/incident').findByIdFull(incidentId);
    const json = typeof incident.toJSON === 'function' ? incident.toJSON() : incident;

    res.render('portal/misEnviosIncidentSurveyForm', {
        support: await getSupportInfo(),
        incident: {
            id: json.id,
            typeLabel: json.type?.description || json.type?.code || 'Incidencia',
            trackingId: json.shipment?.trackingId || '-',
            shipmentId: json.shipmentId,
        },
        survey,
        flash: req.query.ok === '1' ? 'Tu encuesta fue registrada correctamente.' : null,
        error: req.query.error ? String(req.query.error) : null,
    });
};

const postIncidentSurvey = async (req, res) => {
    const incidentId = Number(req.params.incidentId);
    const result = await submitIncidentSurvey(incidentId, res.locals.portalClient, req.body);

    if (!result.ok) {
        return res.redirect(`/portal/mis-envios/encuesta-incidencia/${incidentId}?error=${encodeURIComponent(result.message)}`);
    }

    return res.redirect(`/portal/mis-envios/encuesta-incidencia/${incidentId}?ok=1`);
};

module.exports = {
    getIdentifyForm,
    postRequestAccess,
    getConfirmAccess,
    getShipmentList,
    getShipmentDetail,
    getManageForm,
    postManageForm,
    getIncidentList,
    getIncidentDetail,
    postIncidentResponse,
    getIncidentAttachment,
    getSurveyList,
    getSurveyForm,
    postSurvey,
    getIncidentSurveyList,
    getIncidentSurveyForm,
    postIncidentSurvey,
    postLogout,
    formatModificationsList,
};
