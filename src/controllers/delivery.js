const { DeliveryEvidence, Shipment } = require('../models');

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
            shipmentId: shipment.id
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
            receiverDni
        } = req.body;

        await DeliveryEvidence.create({
            shipmentId: shipment.id,
            receiverName,
            receiverLastname,
            receiverDni
        });

        res.send('Evidencia guardada correctamente');

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

module.exports = {
    showEvidenceForm,
    saveEvidence
};