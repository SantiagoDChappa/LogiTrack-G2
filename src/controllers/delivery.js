const { DeliveryEvidence, Shipment } = require('../models');
const shipmentHistoryModel = require('../models/shipmentHistory');
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

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId:   Status.DELIVERED.id,
            comment:      'Entrega confirmada por repartidor',
            userId:       res.locals.currentUser?.id || null,
            eventType:    'STATUS_CHANGE',
        });

        await Shipment.update(
            { statusId: Status.DELIVERED.id },
            { where: { id: shipment.id } }
        );

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