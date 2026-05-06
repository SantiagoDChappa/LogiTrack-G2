const { DeliveryEvidence, Shipment } = require('../models');
const stateMachine = require('../services/shipmentStateMachine');
const { Status } = require('../constants/enums');

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
            shipmentId: shipment.trackingId
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

        await stateMachine.transition({
            shipmentId: shipment.id,
            toStatusId: Status.DELIVERED.id,
            actor: res.locals.currentUser,
            comment: 'Entrega confirmada por repartidor',
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
    saveEvidence
};