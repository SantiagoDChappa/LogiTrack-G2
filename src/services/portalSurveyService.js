const shipmentModel = require('../models/shipment');
const surveyModel = require('../models/deliverySurvey');
const { assertClientOwnsShipment } = require('./portalClientAccess');
const { Status } = require('../constants/enums');

const DELIVERED_STATUS_ID = Status.DELIVERED.id;
const RATING_MIN = 1;
const RATING_MAX = 5;
const COMMENT_MAX_LENGTH = 2000;
const RATING_FIELDS = ['overallRating', 'punctualityRating', 'packageConditionRating', 'serviceRating'];

const isDelivered = (shipment) => {
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
    return Number(json.statusId || json.status?.id) === DELIVERED_STATUS_ID;
};

const getEligibleShipments = async (client) => {
    const shipments = await shipmentModel.findByClientIdentity(
        { document: client.document, email: client.email },
    );
    const delivered = shipments.filter(isDelivered);
    if (!delivered.length) return { pending: [], completed: [] };

    const ids = delivered.map((s) => (typeof s.toJSON === 'function' ? s.toJSON() : s).id);
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

    const pending = delivered.filter((s) => !answeredIds.has((typeof s.toJSON === 'function' ? s.toJSON() : s).id)).map(formatRow);
    const completed = delivered.filter((s) => answeredIds.has((typeof s.toJSON === 'function' ? s.toJSON() : s).id)).map(formatRow);

    return { pending, completed };
};

const isEligible = async (shipmentId, client) => {
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) return { eligible: false, reason: 'not_found' };
    if (!assertClientOwnsShipment(shipment, client)) return { eligible: false, reason: 'not_owner' };
    if (!isDelivered(shipment)) return { eligible: false, reason: 'not_delivered' };
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
            not_delivered: 'El envío aún no fue entregado.',
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

module.exports = {
    getEligibleShipments,
    isEligible,
    submitSurvey,
    getCompletedSurvey,
    validateRatings,
    isDelivered,
    RATING_FIELDS,
};
