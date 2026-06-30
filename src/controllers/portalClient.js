const settingModel = require('../models/setting');
const shipmentModel = require('../models/shipment');
const {
    COOKIE_NAME,
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
    listIncidentsForShipment,
    loadIncidentDetailViewModel,
    loadOwnedIncident,
} = require('../services/portalIncidentView');
const { submitClientResponse } = require('../services/portalIncidentResponseService');
const incidentAttachmentModel = require('../models/incidentAttachment');
const {
    getEligibleShipments,
    isEligible,
    submitSurvey,
    verifySurveyToken,
    clientFromShipment,
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
        document: result.pending.document,
        expiresAt: result.pending.expiresAt,
        mailDelivered: result.pending.mailDelivered,
        devCode: result.pending.devCode,
        error: null,
    });
};

const setPortalSession = (res, sessionToken) => {
    res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
    });
};

// CP-CONS01: confirmación del acceso ingresando el código de 6 dígitos enviado por email.
const postConfirmAccess = async (req, res) => {
    const code = req.body.code;
    const email = req.body.email;
    const result = await confirmAccess(code, email);
    if (!result.ok) {
        return res.status(result.status).render('portal/misEnviosPending', {
            support: await getSupportInfo(),
            email,
            document: req.body.document,
            expiresAt: req.body.expiresAt || new Date(),
            mailDelivered: true,
            devCode: null,
            error: result.message,
        });
    }

    setPortalSession(res, result.sessionToken);
    return res.redirect('/portal/mis-envios/lista');
};

// Compat: confirmación por link (?token=) — opcional, usado en desarrollo.
const getConfirmAccess = async (req, res) => {
    const result = await confirmAccess(req.query.token, req.query.email);
    if (!result.ok) {
        return res.status(result.status).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: result.message,
        });
    }

    setPortalSession(res, result.sessionToken);
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
    const incidents = await listIncidentsForShipment(shipmentId);

    // LGT-182 — devoluciones vinculadas (incidencias RETURN) + posibilidad de solicitar una nueva.
    const returnIncidentService = require('../services/returnIncidentService');
    const { ReturnReasonLabel, Status } = require('../constants/enums');
    const returnRows = await returnIncidentService.listByShipment(shipmentId);
    const returns = returnRows.map((r) => ({
        id: r.id,
        status: r.status,
        statusLabel: returnIncidentService.portalStatusLabel(r),
        reasonLabel: ReturnReasonLabel[r.returnReason] || r.returnReason || 'Devolución',
        createdAt: r.createdAt,
    }));
    const hasAnyReturn = await returnIncidentService.findAnyByShipment(shipmentId);
    const canRequestReturn = shipment.statusId === Status.DELIVERED.id && !hasAnyReturn;

    // Resumen de estado (estilo ML) + QR de retiro. Acá SÍ se muestra el QR/código porque el
    // cliente ya está identificado en Mis Envíos.
    const statusView = require('../services/shipmentStatusView.service');
    let eta = null;
    if (enriched.deliveryMode !== 'branch_pickup') {
        try { eta = await require('../services/etaWindow.service').etaForShipment(enriched.id); }
        catch { /* sin ETA */ }
    }
    const sv = statusView.buildStatusMessage(enriched, eta);
    const timeline = statusView.buildTimeline(enriched.history);
    let qrDataUrl = null;
    let pickup = null;
    if (sv.isReady && enriched.pickupToken) {
        try { qrDataUrl = await require('qrcode').toDataURL(enriched.pickupToken, { width: 320, margin: 1 }); }
        catch (e) { console.error('[pickup] QR gen:', e.message); }
        pickup = { code: enriched.pickupCode || '', expires: statusView.fmtDate(enriched.pickupExpiresAt) };
    }

    res.render('portal/misEnviosDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        shipment: enriched,
        canSelfService: canSelfService(enriched),
        modifications,
        incidents,
        returns,
        canRequestReturn,
        returnError: req.query.returnError ? String(req.query.returnError) : null,
        sv, timeline, qrDataUrl, pickup,
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

    // LGT-204: elección reembolso/reemplazo solo para incidencias de paquete dañado.
    const damageSvc = require('../services/incidentDamageResolution');
    const isDamage = damageSvc.isDamageType(incident.type);

    res.render('portal/misEnviosIncidentDetail', {
        support: await getSupportInfo(),
        client: res.locals.portalClient,
        incident: await loadIncidentDetailViewModel(incident),
        damage: { isDamage, choice: incident.damageChoice || null, options: damageSvc.CHOICES, closed: !!incident.closedAt, resolution: incident.resolution || null },
        flash: req.query.ok === '1' ? 'Tu respuesta fue enviada correctamente.'
            : req.query.choice ? 'Registramos tu solicitud de devolución. Queda pendiente de aprobación del supervisor; cuando la apruebe, te emitimos la nota de crédito y marcamos el envío como Devuelto.'
            : req.query.declined === '1' ? 'Registramos que no solicitás la devolución.'
            : null,
        error: req.query.error ? String(req.query.error) : null,
    });
};

// LGT-204 — el remitente registra su elección (reembolso/reemplazo).
const postDamageChoice = async (req, res) => {
    const incidentId = Number(req.params.id);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Incidencia no encontrada.',
        });
    }
    try {
        const damageSvc = require('../services/incidentDamageResolution');
        await damageSvc.setChoice({
            incidentId,
            choice: req.body.choice,
            by: res.locals.portalClient?.email || res.locals.portalClient?.document || null,
        });
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?choice=1`);
    } catch (e) {
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?error=${encodeURIComponent(e.message)}`);
    }
};

// [prototype] El remitente decide NO solicitar la devolución → la incidencia se marca
// NO_PROCEDENTE (sin cerrar: el supervisor puede revisarla). No genera nota de crédito
// ni cambia el estado del envío.
const postDamageDecline = async (req, res) => {
    const incidentId = Number(req.params.id);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Incidencia no encontrada.',
        });
    }
    try {
        if (incident.closedAt) { throw new Error('La incidencia ya fue cerrada'); }
        const { Incident } = require('../models/incident');
        const incidentHistory = require('../models/incidentHistory');
        const { IncidentResolution, IncidentEventType } = require('../constants/enums');
        const by = res.locals.portalClient?.email || res.locals.portalClient?.document || null;

        await Incident.update({ resolution: IncidentResolution.NO_PROCEDENTE }, { where: { id: incidentId } });
        await incidentHistory.create({
            incidentId,
            eventType: IncidentEventType.COMMENT,
            fromValue: incident.resolution || null,
            toValue:   IncidentResolution.NO_PROCEDENTE,
            comment:   `El remitente indicó que NO solicita la devolución${by ? ' (' + by + ')' : ''}. Incidencia marcada como no procedente.`,
        });
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?declined=1`);
    } catch (e) {
        return res.redirect(`/portal/mis-envios/incidencia/${incidentId}?error=${encodeURIComponent(e.message)}`);
    }
};

const postIncidentResponse = async (req, res) => {
    const incidentId = Number(req.params.id);
    const incident = await loadOwnedIncident(incidentId, res.locals.portalClient);
    if (!incident) {
        // CP-RINC11: aislamiento de datos — no se permite interactuar con incidencias ajenas.
        return res.status(403).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'No tiene permisos para interactuar con esta incidencia',
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

// CP-ENCS03: encuesta accesible desde el email sin login (token firmado por envío).
const getPublicSurveyForm = async (req, res) => {
    const token = req.params.token;
    const shipmentId = verifySurveyToken(token);
    if (!shipmentId) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'El enlace de la encuesta no es válido o expiró.',
        });
    }

    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const check = await isEligible(shipmentId, clientFromShipment(shipment));
    if (check.reason === 'not_terminal') {
        return res.status(400).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'El envío aún no finalizó su gestión.',
        });
    }

    const survey = check.reason === 'already_answered' ? check.survey : null;
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
        actionUrl: `/portal/encuesta/${encodeURIComponent(token)}`,
        publicMode: true,
    });
};

const postPublicSurvey = async (req, res) => {
    const token = req.params.token;
    const shipmentId = verifySurveyToken(token);
    if (!shipmentId) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'El enlace de la encuesta no es válido o expiró.',
        });
    }

    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) {
        return res.status(404).render('portal/misEnviosConfirmError', {
            support: await getSupportInfo(),
            error: 'Envío no encontrado.',
        });
    }

    const result = await submitSurvey(shipmentId, clientFromShipment(shipment), req.body);
    const base = `/portal/encuesta/${encodeURIComponent(token)}`;
    if (!result.ok) {
        return res.redirect(`${base}?error=${encodeURIComponent(result.message)}`);
    }
    return res.redirect(`${base}?ok=1`);
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
    postConfirmAccess,
    getConfirmAccess,
    getShipmentList,
    getShipmentDetail,
    getManageForm,
    postManageForm,
    getIncidentList,
    getIncidentDetail,
    postIncidentResponse,
    postDamageChoice,
    postDamageDecline,
    getIncidentAttachment,
    getSurveyList,
    getSurveyForm,
    postSurvey,
    getPublicSurveyForm,
    postPublicSurvey,
    getIncidentSurveyList,
    getIncidentSurveyForm,
    postIncidentSurvey,
    postLogout,
    formatModificationsList,
};
