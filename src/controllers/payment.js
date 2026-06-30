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
const sequelize = require('../database/connection');
const shipmentHistoryModel = require('../models/shipmentHistory');
const statusModel = require('../models/status');
const { Status } = require('../constants/enums');
const { resolveUserBranchCoords } = require('../utils/eventLocation');
const { notifyStatusChange } = require('../utils/notifications');
const paymentMethodsConfig = require('../services/paymentMethodsConfig');

// Mercado Pago está disponible en el link público solo si hay credenciales
// configuradas Y el administrador no lo deshabilitó desde Ajustes → Cobros.
const isMpEnabled = async () => {
    if (!mercadoPagoService.isConfigured()) { return false; }
    const cfg = await paymentMethodsConfig.get();
    return cfg.mercadopagoEnabled;
};

const renderCheckout = async (res, invoice, extra = {}) => {
    const shipment = await shipmentModel.getById(invoice.shipmentId).catch(() => null);
    const empresa = (await settingModel.get('nombre_empresa')) || 'LogiTrack';
    const paymentMethods = await paymentMethodsConfig.get();
    res.render('payment/checkout', {
        invoice,
        shipment,
        empresa,
        total: totalConIva(invoice),
        mpConfigured: await isMpEnabled(),
        // Credenciales presentes pero el admin lo apagó desde Ajustes → distinto
        // mensaje del modo simulado (que es cuando ni siquiera hay credenciales).
        mpDisabledByAdmin: mercadoPagoService.isConfigured() && !paymentMethods.mercadopagoEnabled,
        paymentMethods,
        layout: false,
        ...extra,
    });
};

// Destraba un envío en "Pendiente de Pago" una vez que su factura se confirma pagada,
// sin importar el canal (cliente desde el link, operador, o webhook de Mercado Pago).
// No hace nada si el envío no estaba esperando el pago.
const unlockShipmentIfPendingPayment = async (shipmentId, { method, actorUser } = {}) => {
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment || shipment.statusId !== Status.PENDING_PAYMENT.id) { return; }

    const actorCoords = await resolveUserBranchCoords(actorUser?.id);
    await sequelize.transaction(async (t) => {
        await shipmentHistoryModel.create({
            shipmentId,
            fromStatusId: Status.PENDING_PAYMENT.id,
            toStatusId: Status.PENDING.id,
            comment: actorUser
                ? `Cobro registrado (${method}) por ${actorUser.fullName}.`
                : `Pago confirmado (${method}).`,
            userId: actorUser?.id || null,
            eventType: 'STATUS_CHANGE',
            branchId: actorCoords.branchId,
            latitude: actorCoords.latitude,
            longitude: actorCoords.longitude,
            transaction: t,
        });
        await shipmentModel.updateStatus(shipmentId, Status.PENDING.id, { transaction: t });
    });

    const newStatus = await statusModel.getById(Status.PENDING.id);
    if (newStatus) { notifyStatusChange(shipment, newStatus.description); }
};

// GET /pago/:token — muestra el checkout (o el comprobante si ya está pagada).
const getCheckout = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    return renderCheckout(res, invoice);
};

// POST /pago/:token — confirma el pago simulado con Mercado Pago, solo cuando MP
// no está configurado (si está configurado, se usa /pago/:token/mp en su lugar).
// Efectivo y transferencia ya no se autoconfirman desde el link público: las
// registra un operador desde el detalle del envío (ver postRegisterPayment),
// para que quede constancia real de quién verificó el cobro.
const postPay = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    const method = 'mercadopago';
    await invoiceService.markPaid(invoice, { method });
    await unlockShipmentIfPendingPayment(invoice.shipmentId, { method });
    return renderCheckout(res, invoice, { justPaid: true });
};

// POST /pago/:token/mp — crea una preferencia real de Mercado Pago y redirige
// al checkout de MP. Solo tiene sentido si MP está configurado.
const postPayMp = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice || invoice.payStatus !== 'PENDIENTE' || !(await isMpEnabled())) {
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

// POST /pago/:token/efectivo — el remitente avisa que pagó en efectivo (Pago Fácil
// simulado) y adjunta una foto del comprobante. No marca la factura como pagada:
// queda "en verificación" hasta que un operador/supervisor lo confirma.
const postReportEfectivo = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    if (!req.file) {
        return renderCheckout(res, invoice, { comprobanteError: 'Subí una foto del comprobante de Pago Fácil.' });
    }
    if (invoice.payStatus === 'PENDIENTE' && !invoice.pendingVerificationMethod) {
        const cfg = await paymentMethodsConfig.get();
        if (cfg.efectivoEnabled) {
            await invoiceService.requestVerification(invoice, { method: 'efectivo', file: req.file });
        }
    }
    return renderCheckout(res, invoice, { justReported: true });
};

// POST /pago/:token/transferencia — el remitente sube el comprobante de transferencia.
// Igual que el efectivo: queda "en verificación", no se autoconfirma.
const postUploadComprobante = async (req, res) => {
    const invoice = await invoiceService.getByToken(req.params.token);
    if (!invoice) {
        return res.status(404).render('payment/checkout', { invoice: null, layout: false });
    }
    if (!req.file) {
        return renderCheckout(res, invoice, { comprobanteError: 'Subí una imagen o PDF del comprobante.' });
    }
    if (invoice.payStatus === 'PENDIENTE' && !invoice.pendingVerificationMethod) {
        const cfg = await paymentMethodsConfig.get();
        if (cfg.transferenciaEnabled) {
            await invoiceService.requestVerification(invoice, { method: 'transferencia', file: req.file });
        }
    }
    return renderCheckout(res, invoice, { justReported: true });
};

// GET /shipment/:id/comprobante — el operador/supervisor/admin ve el comprobante
// de transferencia que subió el remitente, para verificarlo antes de confirmar el cobro.
const getComprobante = async (req, res) => {
    const invoice = await invoiceService.getByShipment(Number(req.params.id));
    if (!invoice || !invoice.comprobanteData) {
        return res.status(404).send('No hay comprobante para este envío');
    }
    const buffer = Buffer.from(invoice.comprobanteData, 'base64');
    const fileName = (invoice.comprobanteFileName || 'comprobante').replace(/"/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.type(invoice.comprobanteMime || 'application/octet-stream').send(buffer);
};

// POST /shipment/:id/descartar-verificacion — el operador descarta un pago
// reportado (p. ej. comprobante inválido) sin marcarlo como cobrado, para que
// el remitente pueda reintentar desde el link.
const postDiscardVerification = async (req, res) => {
    const invoice = await invoiceService.getByShipment(Number(req.params.id));
    if (invoice) { await invoiceService.clearVerification(invoice); }
    return res.redirect(`/shipment/update/${req.params.id}`);
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
        await unlockShipmentIfPendingPayment(invoice.shipmentId, { method: 'mercadopago' });
        return res.json({ status: 'ok' });
    } catch (e) {
        console.error('[payment] error procesando webhook:', e.message);
        return res.json({ status: 'error_interno' });
    }
};

// POST /shipment/:id/registrar-cobro — un operador/supervisor/admin registra el cobro
// de un envío (efectivo o transferencia) desde el detalle del envío, sin pasar por el
// link público. Si el envío estaba en "Pendiente de Pago", lo destraba a "Pendiente".
const postRegisterPayment = async (req, res) => {
    const shipmentId = Number(req.params.id);
    const method = ['efectivo', 'transferencia'].includes(req.body.method) ? req.body.method : 'efectivo';
    const returnUrl = `/shipment/update/${shipmentId}`;

    const invoice = await invoiceService.getByShipment(shipmentId);
    if (!invoice) { return res.redirect(returnUrl); }
    if (invoice.payStatus !== 'PAGADA') {
        await invoiceService.markPaid(invoice, { method });
    }

    await unlockShipmentIfPendingPayment(shipmentId, { method, actorUser: res.locals.currentUser });

    return res.redirect(returnUrl);
};

module.exports = {
    getCheckout, postPay, postPayMp, postWebhook, postRegisterPayment,
    postReportEfectivo, postUploadComprobante, getComprobante, postDiscardVerification,
};
