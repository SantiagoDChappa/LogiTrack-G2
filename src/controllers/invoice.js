// Factura del envío (comprobante). Visualización para impresión.
const invoiceService = require('../services/invoiceService');
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');

const view = async (req, res) => {
    const inv = await invoiceService.getById(Number(req.params.id));
    if (!inv) {
        return res.status(404).render('error', { message: 'Factura no encontrada' });
    }
    const shipment = await shipmentModel.getById(inv.shipmentId);
    const empresa = (await settingModel.get('nombre_empresa')) || 'LogiTrack';
    res.render('shipment/invoice', { inv, shipment, empresa });
};

module.exports = { view };
