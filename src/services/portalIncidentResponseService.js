const sequelize = require('../database/connection');
const { Incident } = require('../models/incident');
const incidentHistoryModel = require('../models/incidentHistory');
const incidentAttachmentModel = require('../models/incidentAttachment');
const shipmentModel = require('../models/shipment');
const { EVIDENCE_MAX_BYTES, ALLOWED_EVIDENCE_MIME } = require('../middlewares/upload');
const { assertClientOwnsShipment } = require('./portalClientAccess');
const { statusLabel } = require('./portalIncidentView');
const { IncidentStatus, IncidentEventType } = require('../constants/enums');

const canClientInteract = (incident) => {
    const status = incident?.status ?? incident?.toJSON?.()?.status;
    return [IncidentStatus.OPEN, IncidentStatus.IN_REVIEW].includes(status);
};

const resolveClientPersonId = (shipment, client) => {
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
    const { normalize } = require('./incidentEmailValidation');
    const doc = Number(client.document);
    const email = normalize(client.email);

    if (json.sender?.document === doc && normalize(json.sender?.email) === email) {
        return json.sender.id;
    }
    if (json.recipient?.document === doc && normalize(json.recipient?.email) === email) {
        return json.recipient.id;
    }
    return null;
};

const validateAttachmentFile = (file) => {
    if (!file) { return { ok: true }; }
    if (!ALLOWED_EVIDENCE_MIME.includes(file.mimetype)) {
        return {
            ok: false,
            message: 'Solo se aceptan imágenes JPG/PNG o documentos PDF.',
        };
    }
    if (file.size > EVIDENCE_MAX_BYTES) {
        return {
            ok: false,
            message: 'El archivo supera el tamaño máximo permitido de 5 MB.',
        };
    }
    return { ok: true };
};

const buildAttachmentFromFile = (file) => {
    const check = validateAttachmentFile(file);
    if (!check.ok || !file) { return { ok: false, message: check.message || 'Archivo no válido.' }; }
    return {
        ok: true,
        data: {
            fileName: String(file.originalname || 'evidencia').slice(0, 200),
            mimeType: file.mimetype,
            dataBase64: file.buffer.toString('base64'),
        },
    };
};

const submitClientResponse = async ({ incident, client, comment, file }) => {
    if (!canClientInteract(incident)) {
        return {
            ok: false,
            status: 409,
            message: 'Esta incidencia ya no admite nuevas interacciones.',
        };
    }

    const trimmedComment = String(comment || '').trim();
    const fileCheck = validateAttachmentFile(file);
    if (!fileCheck.ok) {
        return { ok: false, status: 400, message: fileCheck.message };
    }

    if (!trimmedComment && !file) {
        return {
            ok: false,
            status: 400,
            message: 'Ingresá un comentario o adjuntá al menos un archivo.',
        };
    }

    const json = typeof incident.toJSON === 'function' ? incident.toJSON() : incident;
    const shipment = await shipmentModel.getById(json.shipmentId);
    if (!shipment || !assertClientOwnsShipment(shipment, client)) {
        return { ok: false, status: 404, message: 'Incidencia no encontrada.' };
    }

    const personId = resolveClientPersonId(shipment, client);
    const shouldMoveToReview = json.status === IncidentStatus.OPEN;

    await sequelize.transaction(async (transaction) => {
        if (trimmedComment) {
            await incidentHistoryModel.create({
                incidentId: json.id,
                eventType: IncidentEventType.COMMENT,
                comment: trimmedComment.slice(0, 2000),
                personId,
                transaction,
            });
        }

        if (file) {
            const built = buildAttachmentFromFile(file);
            await incidentAttachmentModel.IncidentAttachment.create({
                incidentId:       json.id,
                fileName:         built.data.fileName,
                mimeType:         built.data.mimeType,
                dataBase64:       built.data.dataBase64,
                source:           'PORTAL',
                uploadedByPersonId: personId,
                createdAt:        new Date(),
            }, { transaction });
            await incidentHistoryModel.create({
                incidentId: json.id,
                eventType:  IncidentEventType.EVIDENCE_ADDED,
                comment:    `Evidencia adjuntada: ${built.data.fileName}`,
                personId,
                transaction,
            });
        }

        if (shouldMoveToReview) {
            await Incident.update({ status: IncidentStatus.IN_REVIEW }, {
                where: { id: json.id },
                transaction,
            });
            await incidentHistoryModel.create({
                incidentId: json.id,
                eventType:  IncidentEventType.STATUS_CHANGE,
                fromValue:  IncidentStatus.OPEN,
                toValue:    IncidentStatus.IN_REVIEW,
                comment:    'El cliente aportó información adicional.',
                personId,
                transaction,
            });
        }
    });

    return { ok: true, incidentId: json.id, movedToReview: shouldMoveToReview };
};

module.exports = {
    canClientInteract,
    validateAttachmentFile,
    buildAttachmentFromFile,
    submitClientResponse,
    resolveClientPersonId,
};
