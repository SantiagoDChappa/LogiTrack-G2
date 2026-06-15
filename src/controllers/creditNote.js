// LGT-214 — visualización de la nota de crédito (comprobante).
const creditNoteService = require('../services/creditNoteService');
const shipmentModel = require('../models/shipment');
const costSvc = require('../services/shipmentCostService');
const settingModel = require('../models/setting');

const view = async (req, res) => {
    const cn = await creditNoteService.getById(Number(req.params.id));
    if (!cn) {
        return res.status(404).render('error', { message: 'Nota de crédito no encontrada' });
    }
    const shipment = await shipmentModel.getById(cn.shipmentId);
    const breakdown = shipment ? await costSvc.computeCost(shipment) : null;
    const empresa = (await settingModel.get('nombre_empresa')) || 'LogiTrack';
    res.render('return/creditNote', { cn, shipment, breakdown, empresa });
};

module.exports = { view };
