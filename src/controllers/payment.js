// [prototype] Checkout de pago de la factura. Público: el remitente llega desde el
// link del mail (/pago/:token), sin login. Si Mercado Pago está configurado
// (MERCADOPAGO_ACCESS_TOKEN), el medio "mercadopago" crea una preferencia real y
// redirige al checkout de MP; el pago se confirma vía webhook. Si no está
// configurado, "mercadopago" cae al mismo simulado que efectivo/transferencia
// (markPaid inmediato), igual que antes — la demo nunca depende de credenciales.
const invoiceService = require('../services/invoiceService');
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const mercadoPagoService = require('../services/mercadoPagoService');
const webhookEventModel = require('../models/paymentWebhookEvent');
const { totalConIva } = require('../services/invoicePaymentEmail');

const renderCheckout = async (res, invoice, extra = {}) => {
    const shipment = await shipmentModel.getById(invoice.shipmentId).catch(() => null);
    const empresa = (await settingModel.get('nombre_empresa')) || 'LogiTrack';
    res.render('payment/checkout', {
        invoice,
        shipment,
        empresa,
        total: totalConIva(invoice),
        mpConfigured: mercadoPagoService.isConfigured(),
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

// POST /pago/:token — confirma el pago simulado (efectivo/transferencia, o
// mercadopago cuando MP no está configurado).
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

// POST /pago/:token/mp — crea una preferencia real de Mercado Pago y redirige
// al checkout de MP. Solo tiene sentido si MP está configurado.
const postPayMp = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice || invoice.payStatus === 'PAGADA' || !mercadoPagoService.isConfigured()) {
        return res.redirect(`/pago/${req.params.token}`);
    }
    const shipment = await shipmentModel.getById(invoice.shipmentId).catch(() => null);
    try {
        const pref = await mercadoPagoService.createPreference({
            invoice,
            trackingId: shipment?.trackingId,
            amount: totalConIva(invoice),
        });
        await invoiceService.setMpPreference(invoice, pref.id);
        return res.redirect(pref.initPoint);
    } catch (e) {
        console.error('[payment] error al crear preferencia MP:', e.message);
        return renderCheckout(res, invoice, { mpError: 'No se pudo iniciar el pago con Mercado Pago. Probá otro medio.' });
    }
};

// POST /payment/webhook — notificación de Mercado Pago. Siempre responde 200
// (incluso ante error interno) para que MP no reintente indefinidamente.
const postWebhook = async (req, res) => {
    // Dos formatos posibles: el IPN clásico (?topic=merchant_order&id=...,
    // donde "id" es un merchant_order, no un payment) y el webhook nuevo
    // (data.id / ?topic=payment, donde el id ya es el del pago).
    const topic = req.query.topic || req.query.type || req.body?.action;
    const rawId = req.body?.data?.id ? String(req.body.data.id) : (req.query['data.id'] || req.query.id || null);
    if (!rawId) { return res.json({ status: 'ignorado' }); }

    const valid = mercadoPagoService.validateWebhookSignature({
        xSignature: req.headers['x-signature'],
        xRequestId: req.headers['x-request-id'],
        dataId: rawId,
    });
    if (!valid) { return res.json({ status: 'firma_invalida' }); }

    try {
        let dataId = rawId;
        if (topic === 'merchant_order') {
            dataId = await mercadoPagoService.getApprovedPaymentIdFromMerchantOrder(rawId);
            if (!dataId) { return res.json({ status: 'sin_pago_aprobado_aun' }); }
        }

        const isNew = await webhookEventModel.recordIfNew(dataId);
        if (!isNew) { return res.json({ status: 'ya_procesado' }); }

        const payment = await mercadoPagoService.getPayment(dataId);
        if (payment.status !== 'approved') {
            return res.json({ status: 'sin_accion', mpStatus: payment.status });
        }

        const invoice = await invoiceService.getByToken(payment.external_reference);
        if (!invoice) {
            console.warn('[payment] webhook: factura no encontrada para token', payment.external_reference);
            return res.json({ status: 'factura_no_encontrada' });
        }

        await invoiceService.markPaidByMp(invoice, String(payment.id));
        return res.json({ status: 'ok' });
    } catch (e) {
        console.error('[payment] error procesando webhook:', e.message);
        return res.json({ status: 'error_interno' });
    }
};

module.exports = { getCheckout, postPay, postPayMp, postWebhook };
