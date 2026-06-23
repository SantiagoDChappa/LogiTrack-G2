// [prototype] Checkout de pago simulado (estilo Mercado Pago). Público: el remitente
// llega desde el link del mail (/pago/:token), sin login. "Pagar" marca la factura
// como PAGADA y le asigna un id de transacción simulado. No mueve dinero real.
const invoiceService = require('../services/invoiceService');
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const { totalConIva } = require('../services/invoicePaymentEmail');

const renderCheckout = async (res, invoice, extra = {}) => {
    const shipment = await shipmentModel.getById(invoice.shipmentId).catch(() => null);
    const empresa = (await settingModel.get('nombre_empresa')) || 'LogiTrack';
    res.render('payment/checkout', {
        invoice,
        shipment,
        empresa,
        total: totalConIva(invoice),
        layout: false,
        ...extra,
    });
};

// GET /pago/:token — muestra el checkout (o el comprobante si ya está pagada).
const getCheckout = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    return renderCheckout(res, invoice);
};

// POST /pago/:token — confirma el pago simulado.
const postPay = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    const method = ['mercadopago', 'efectivo', 'transferencia'].includes(req.body.method)
        ? req.body.method : 'mercadopago';
    await invoiceService.markPaid(invoice, { method });
    return renderCheckout(res, invoice, { justPaid: true });
};

module.exports = { getCheckout, postPay };
