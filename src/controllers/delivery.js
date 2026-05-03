const { DeliveryEvidence } = require('../models');

const showEvidenceForm = async (req, res) => {
    try {
        const shipmentId = req.params.id;

        res.render('delivery/evidence', {
            shipmentId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const saveEvidence = async (req, res) => {
    try {

        const shipmentId = req.params.id;
        const {
            receiverName,
            receiverLastname,
            receiverDni
        } = req.body;

        await DeliveryEvidence.create({
            shipmentId,
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