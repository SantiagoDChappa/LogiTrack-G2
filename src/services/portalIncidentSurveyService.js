const incidentModel = require('../models/incident');
const incidentSurveyModel = require('../models/incidentSurvey');
const { assertClientOwnsIncident } = require('./portalIncidentView');
const { IncidentStatus } = require('../constants/enums');

const RATING_MIN = 1;
const RATING_MAX = 5;
const COMMENT_MAX_LENGTH = 2000;
const RATING_FIELDS = ['overallRating', 'resolutionTimeRating', 'communicationRating', 'outcomeRating'];

const isClosed = (incident) => {
    const json = typeof incident.toJSON === 'function' ? incident.toJSON() : incident;
    return json.status === IncidentStatus.CLOSED;
};

const getEligibleIncidents = async (client) => {
    const { getClientShipmentIds } = require('./portalIncidentView');
    const shipmentIds = await getClientShipmentIds(client);
    if (!shipmentIds.length) return { pending: [], completed: [] };

    const closedIncidents = await incidentModel.findByShipmentIds(shipmentIds, {
        statusIn: [IncidentStatus.CLOSED],
    });
    if (!closedIncidents.length) return { pending: [], completed: [] };

    const ids = closedIncidents.map((i) => {
        const json = typeof i.toJSON === 'function' ? i.toJSON() : i;
        return json.id;
    });
    const surveys = await incidentSurveyModel.findByIncidentIds(ids);
    const answeredIds = new Set(surveys.map((s) => s.incidentId));

    const formatRow = (i) => {
        const json = typeof i.toJSON === 'function' ? i.toJSON() : i;
        return {
            incidentId: json.id,
            shipmentId: json.shipmentId,
            trackingId: json.shipment?.trackingId || null,
            typeLabel: json.type?.description || json.type?.code || 'Incidencia',
            createdAt: json.createdAt,
            closedAt: json.closedAt,
        };
    };

    const pending = closedIncidents.filter((i) => {
        const json = typeof i.toJSON === 'function' ? i.toJSON() : i;
        return !answeredIds.has(json.id);
    }).map(formatRow);

    const completed = closedIncidents.filter((i) => {
        const json = typeof i.toJSON === 'function' ? i.toJSON() : i;
        return answeredIds.has(json.id);
    }).map(formatRow);

    return { pending, completed };
};

const isEligible = async (incidentId, client) => {
    const incident = await incidentModel.findByIdFull(incidentId);
    if (!incident) return { eligible: false, reason: 'not_found' };
    const owns = await assertClientOwnsIncident(incident, client);
    if (!owns) return { eligible: false, reason: 'not_owner' };
    if (!isClosed(incident)) return { eligible: false, reason: 'not_closed' };
    const existing = await incidentSurveyModel.findByIncidentId(incidentId);
    if (existing) return { eligible: false, reason: 'already_answered', survey: existing };
    return { eligible: true, incident };
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

const submitSurvey = async (incidentId, client, answers) => {
    const check = await isEligible(incidentId, client);
    if (!check.eligible) {
        const messages = {
            not_found: 'Incidencia no encontrada.',
            not_owner: 'No tenés acceso a esta incidencia.',
            not_closed: 'La incidencia aún no fue resuelta.',
            already_answered: 'Ya respondiste la encuesta para esta incidencia.',
        };
        return { ok: false, message: messages[check.reason] || 'No es posible responder la encuesta.' };
    }

    const validation = validateRatings(answers);
    if (!validation.ok) return validation;

    const survey = await incidentSurveyModel.create({
        incidentId,
        overallRating: Number(answers.overallRating),
        resolutionTimeRating: Number(answers.resolutionTimeRating),
        communicationRating: Number(answers.communicationRating),
        outcomeRating: Number(answers.outcomeRating),
        comment: answers.comment ? String(answers.comment).trim().slice(0, COMMENT_MAX_LENGTH) : null,
        respondedByDocument: Number(client.document),
        respondedByEmail: String(client.email).toLowerCase().trim(),
    });

    return { ok: true, surveyId: survey.id, incidentId };
};

const getCompletedSurvey = (incidentId) => incidentSurveyModel.findByIncidentId(incidentId);

module.exports = {
    getEligibleIncidents,
    isEligible,
    submitSurvey,
    getCompletedSurvey,
    validateRatings,
    isClosed,
    RATING_FIELDS,
};
