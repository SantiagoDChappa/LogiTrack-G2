const JWT = require('jsonwebtoken');
const shipmentModel = require('../models/shipment');
const surveyModel = require('../models/deliverySurvey');
const { assertClientOwnsShipment } = require('./portalClientAccess');
const { sendEmail } = require('./notification/emailSender');
const { Status } = require('../constants/enums');

// CP-ENCS03: token firmado para abrir la encuesta desde el email sin login.
const SURVEY_TOKEN_TTL = '30d';
const baseUrl = () => (process.env.APP_URL || process.env.BASE_URL || 'https://logitrack-prototype.onrender.com').replace(/\/+$/, '');

const signSurveyToken = (shipmentId) =>
    JWT.sign({ type: 'delivery_survey', shipmentId: Number(shipmentId) }, process.env.JWT_SECRET, { expiresIn: SURVEY_TOKEN_TTL });

const verifySurveyToken = (token) => {
    try {
        const decoded = JWT.verify(String(token || ''), process.env.JWT_SECRET);
        if (decoded.type !== 'delivery_survey' || !decoded.shipmentId) { return null; }
        return Number(decoded.shipmentId);
    } catch {
        return null;
    }
};

// Identidad de cliente derivada del envío (para reusar isEligible/submitSurvey en el flujo por token).
const clientFromShipment = (shipment) => {
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
    return { document: json.recipient?.document, email: json.recipient?.email };
};

const surveyUrl = (shipmentId) => `${baseUrl()}/portal/encuesta/${signSurveyToken(shipmentId)}`;

const ELIGIBLE_STATUS_IDS = new Set([Status.DELIVERED.id, Status.CANCELLED.id]);
const RATING_MIN = 1;
const RATING_MAX = 5;
const COMMENT_MAX_LENGTH = 2000;
const RATING_FIELDS = ['overallRating', 'punctualityRating', 'packageConditionRating', 'serviceRating'];

const isTerminal = (shipment) => {
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
    return ELIGIBLE_STATUS_IDS.has(Number(json.statusId || json.status?.id));
};

const getEligibleShipments = async (client) => {
    const shipments = await shipmentModel.findByClientIdentity(
        { document: client.document, email: client.email },
    );
    const terminal = shipments.filter(isTerminal);
    if (!terminal.length) return { pending: [], completed: [] };

    const ids = terminal.map((s) => (typeof s.toJSON === 'function' ? s.toJSON() : s).id);
    const surveys = await surveyModel.findByShipmentIds(ids);
    const answeredIds = new Set(surveys.map((sv) => sv.shipmentId));

    const formatRow = (s) => {
        const json = typeof s.toJSON === 'function' ? s.toJSON() : s;
        return {
            shipmentId: json.id,
            trackingId: json.trackingId,
            recipientName: json.recipient?.fullName || '-',
            createdAt: json.createdAt,
        };
    };

    const pending = terminal.filter((s) => !answeredIds.has((typeof s.toJSON === 'function' ? s.toJSON() : s).id)).map(formatRow);
    const completed = terminal.filter((s) => answeredIds.has((typeof s.toJSON === 'function' ? s.toJSON() : s).id)).map(formatRow);

    return { pending, completed };
};

const isEligible = async (shipmentId, client) => {
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) return { eligible: false, reason: 'not_found' };
    if (!assertClientOwnsShipment(shipment, client)) return { eligible: false, reason: 'not_owner' };
    if (!isTerminal(shipment)) return { eligible: false, reason: 'not_terminal' };
    const existing = await surveyModel.findByShipmentId(shipmentId);
    if (existing) return { eligible: false, reason: 'already_answered', survey: existing };
    return { eligible: true, shipment };
};

const validateRatings = (answers) => {
    for (const field of RATING_FIELDS) {
        const val = Number(answers[field]);
        if (!Number.isInteger(val) || val < RATING_MIN || val > RATING_MAX) {
            return { ok: false, message: `La calificación de ${field} debe ser un número entre ${RATING_MIN} y ${RATING_MAX}.` };
        }
    }
    if (answers.comment && String(answers.comment).length > COMMENT_MAX_LENGTH) {
        return { ok: false, message: `El comentario no debe superar los ${COMMENT_MAX_LENGTH} caracteres.` };
    }
    return { ok: true };
};

const submitSurvey = async (shipmentId, client, answers) => {
    const check = await isEligible(shipmentId, client);
    if (!check.eligible) {
        const messages = {
            not_found: 'Envío no encontrado.',
            not_owner: 'No tenés acceso a este envío.',
            not_terminal: 'El envío aún no fue entregado o cancelado.',
            already_answered: 'Ya respondiste la encuesta para este envío.',
        };
        return { ok: false, message: messages[check.reason] || 'No es posible responder la encuesta.' };
    }

    const validation = validateRatings(answers);
    if (!validation.ok) return validation;

    const survey = await surveyModel.create({
        shipmentId,
        overallRating: Number(answers.overallRating),
        punctualityRating: Number(answers.punctualityRating),
        packageConditionRating: Number(answers.packageConditionRating),
        serviceRating: Number(answers.serviceRating),
        comment: answers.comment ? String(answers.comment).trim().slice(0, COMMENT_MAX_LENGTH) : null,
        respondedByDocument: Number(client.document),
        respondedByEmail: String(client.email).toLowerCase().trim(),
    });

    return { ok: true, surveyId: survey.id, shipmentId };
};

const getCompletedSurvey = (shipmentId) => surveyModel.findByShipmentId(shipmentId);

// CP-ENCS01: al entregar el envío se envía un email al destinatario con el link a la encuesta.
// Fire-and-forget e idempotente: no reenvía si ya respondió.
const sendSurveyEmail = async (shipmentId) => {
    try {
        const shipment = await shipmentModel.getById(shipmentId);
        if (!shipment) { return false; }
        const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
        if (!isTerminal(json)) { return false; }
        const existing = await surveyModel.findByShipmentId(shipmentId);
        if (existing) { return false; }
        const email = json.recipient?.email;
        if (!email) { return false; }

        const link = surveyUrl(shipmentId);
        const tracking = json.trackingId || `#${shipmentId}`;
        const subject = `¿Cómo fue tu entrega? — ${tracking}`;
        const body = `Hola ${json.recipient?.fullName || ''},

Tu envío ${tracking} ya fue entregado. Nos ayudaría mucho conocer tu opinión.

Respondé la encuesta (no necesitás iniciar sesión) desde este enlace:

${link}

¡Gracias por elegirnos!

Saludos,
Equipo LogiTrack`;
        return await sendEmail(email, subject, body, 'text');
    } catch (err) {
        console.error('[survey] error enviando email de encuesta:', err.message);
        return false;
    }
};

module.exports = {
    getEligibleShipments,
    isEligible,
    submitSurvey,
    getCompletedSurvey,
    validateRatings,
    isTerminal,
    signSurveyToken,
    verifySurveyToken,
    clientFromShipment,
    surveyUrl,
    sendSurveyEmail,
    RATING_FIELDS,
    ELIGIBLE_STATUS_IDS,
};
