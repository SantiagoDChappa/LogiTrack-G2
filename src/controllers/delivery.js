const { DeliveryEvidence, Shipment } = require('../models');
const stateMachine = require('../services/shipmentStateMachine');
const { Status } = require('../constants/enums');
const shipmentHistoryModel = require('../models/shipmentHistory');
const ShipmentModel = require('../models/shipment');

const { getSuggestedDate } = require('../utils/failedAttempt');
const failedAttemptModel = require('../models/failedAttempt');
const shipmentHistoryModel = require('../models/shipmentHistory');

const showFailedForm = async (req, res) => {
    try {
        const trackingCode = req.params.id;
        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });
        if (!shipment) return res.status(404).send('Envío no encontrado');
        res.render('delivery/failed', { trackingCode });
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const saveFailedAttempt = async (req, res) => {
    try {
        const trackingCode = req.params.id;
        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });
        if (!shipment) return res.status(404).send('Envío no encontrado');

        const { reason, observation, latitude, longitude, photoBase64 } = req.body;
        const suggestedDate = getSuggestedDate(reason);

        await failedAttemptModel.create({
            shipmentId:    shipment.id,
            reason,
            observation:   observation || null,
            latitude:      latitude    || null,
            longitude:     longitude   || null,
            photoBase64:   photoBase64 || null,
            suggestedDate,
            status:        'pendiente'
        });

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId:   Status.FAILED_ATTEMPT.id,
            comment:      `Intento fallido: ${reason}`,
            userId:       res.locals.currentUser?.id || null,
            eventType:    'STATUS_CHANGE',
        });

        await Shipment.update(
            { statusId: Status.FAILED_ATTEMPT.id },
            { where: { id: shipment.id } }
        );

        console.log('Estado anterior:', shipment.statusId);
        console.log('Estado nuevo:', Status.FAILED_ATTEMPT.id);

        res.redirect('/delivery?failed=true');

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const showEvidenceForm = async (req, res) => {
    try {
        const trackingCode = req.params.id;

        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        res.render('delivery/evidence', {
            shipmentId: shipment.trackingId,
            errors: {}
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const saveEvidence = async (req, res) => {
    try {

        const trackingCode = req.params.id;

        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        const {
            receiverName,
            receiverLastname,
            receiverDni,
            latitude,
            longitude,
            photoBase64,
            signatureBase64
        } = req.body;

        if (!latitude || !longitude) {

            return res.render('delivery/evidence', {
                shipmentId: trackingCode,
                errors: {
                    ubication: 'La ubicación es requerida para confirmar la entrega.'
                }
            });
        }

        if (signatureBase64 === '') {
            return res.render('delivery/evidence', {
                shipmentId: trackingCode,
                errors: {
                    signature: 'La firma es requerida para confirmar la entrega.'
                }
            });
        }

        if (!stateMachine.canTransition({
            fromStatusId: shipment.statusId,
            toStatusId:   Status.DELIVERED.id,
            actorRoleId:  res.locals.currentUser?.roleId,
        })) {
            return res.status(422).send('No se puede confirmar entrega desde el estado actual.');
        }

        await DeliveryEvidence.create({
            shipmentId: shipment.id,
            receiverName,
            receiverLastname,
            receiverDni,
            latitude:    latitude    || null,
            longitude:   longitude   || null,
            photoBase64: photoBase64 || null,
            signatureBase64: signatureBase64 || null
        });


        await ShipmentModel.updateStatus(shipment.id, Status.DELIVERED.id);

        const podLat = latitude  !== null && latitude  !== undefined && latitude  !== '' ? Number(latitude)  : null;
        const podLng = longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null;
        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId:   Status.DELIVERED.id,
            comment:      'Entrega confirmada por repartidor',
            userId:       res.locals.currentUser?.id || null,
            eventType:    'POD',
            latitude:     Number.isFinite(podLat) ? podLat : null,
            longitude:    Number.isFinite(podLng) ? podLng : null,
        });

        res.redirect('/delivery?delivered=true');

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const showActionScreen = async (req, res) => {
    try {
        const trackingCode = req.params.id;

        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        res.render('delivery/action', { trackingCode });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

module.exports = {
    showActionScreen,
    showEvidenceForm,
    saveEvidence,
    showFailedForm,
    saveFailedAttempt
};