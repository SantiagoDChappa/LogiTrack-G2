// Integración con Mercado Pago (Checkout Pro) para el checkout de facturas que ya
// existe en /pago/:token. Si no hay credenciales configuradas (sin
// MERCADOPAGO_ACCESS_TOKEN), createPreference no se llama: el checkout sigue
// funcionando en modo simulado como hasta ahora (ver controllers/payment.js).
const { MercadoPagoConfig, Preference, Payment: MPPayment, MerchantOrder, WebhookSignatureValidator } = require('mercadopago');

const appBaseUrl = () => process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const isConfigured = () => !!process.env.MERCADOPAGO_ACCESS_TOKEN;

const client = () => new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

// Crea la preferencia de pago para una factura. external_reference = payToken,
// así el webhook puede encontrar la factura sin tabla extra. amount ya debe venir
// calculado con IVA (mismo total que se muestra en el checkout).
const createPreference = async ({ invoice, trackingId, amount }) => {
    const base = appBaseUrl();
    const preference = new Preference(client());
    const result = await preference.create({
        body: {
            items: [{
                title: `Factura ${invoice.number}${trackingId ? ' · Envío ' + trackingId : ''}`,
                quantity: 1,
                unit_price: Number(amount),
                currency_id: 'ARS',
            }],
            external_reference: invoice.payToken,
            notification_url: `${base}/payment/webhook`,
            back_urls: {
                success: `${base}/pago/${invoice.payToken}`,
                failure: `${base}/pago/${invoice.payToken}`,
                pending: `${base}/pago/${invoice.payToken}`,
            },
            auto_return: 'approved',
        },
    });

    return { id: result.id, initPoint: result.init_point };
};

// Consulta el estado real de un pago contra la API de Mercado Pago.
const getPayment = (mpPaymentId) => new MPPayment(client()).get({ id: mpPaymentId });

// El webhook "merchant_order" (notificación IPN clásica) no trae un payment id
// directo, sino un merchant_order id que agrupa uno o más pagos. Devuelve el id
// del pago aprobado más reciente dentro de esa orden (o null si no hay ninguno).
const getApprovedPaymentIdFromMerchantOrder = async (merchantOrderId) => {
    const order = await new MerchantOrder(client()).get({ merchantOrderId });
    const approved = (order.payments || []).filter((p) => p.status === 'approved');
    if (!approved.length) { return null; }
    approved.sort((a, b) => new Date(b.date_approved) - new Date(a.date_approved));
    return String(approved[0].id);
};

// Valida la firma x-signature del webhook. Sin MERCADOPAGO_WEBHOOK_SECRET configurado
// (ej. en desarrollo) no se valida — pero eso solo es aceptable fuera de producción.
const validateWebhookSignature = ({ xSignature, xRequestId, dataId }) => {
    if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) { return true; }
    try {
        WebhookSignatureValidator.validate({
            xSignature, xRequestId, dataId,
            secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
        });
        return true;
    } catch (e) {
        console.error('[mercadoPago] firma de webhook inválida:', e.message);
        return false;
    }
};

module.exports = {
    isConfigured, createPreference, getPayment, validateWebhookSignature, getApprovedPaymentIdFromMerchantOrder,
};
