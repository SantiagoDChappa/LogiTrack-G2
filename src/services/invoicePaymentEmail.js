// [prototype] Mail al remitente con el link de pago simulado de la factura.
// Autocontenido: arma el HTML acá y lo encola con queueEmail, sin depender de que
// el toggle de notificaciones configurables esté activo. El link lleva al checkout
// público /pago/:payToken (estilo Mercado Pago, sin login).
const { queueEmail } = require('./notification/notificationEmailService');
const { baseUrl } = require('./notificationPlaceholders');

const fmt = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Calcula el total con IVA igual que la vista de factura (neto + 21%).
const totalConIva = (invoice) => {
    const neto = Number(invoice.subtotal || invoice.amount || 0);
    return Number((neto * 1.21).toFixed(2));
};

const buildBody = ({ invoice, shipment, payUrl, empresa }) => {
    const total = fmt(totalConIva(invoice));
    const sender = invoice.senderName || shipment?.sender?.fullName || 'Cliente';
    const tracking = shipment?.trackingId || '';
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#009ee3;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.9">${empresa}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Factura ${invoice.number}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>${sender}</strong>,</p>
        <p style="margin:0 0 16px">Generamos la factura de tu envío <strong>${tracking}</strong>. Para completar la contratación, aboná el comprobante:</p>
        <div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 20px">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Total a pagar</div>
          <div style="font-size:30px;font-weight:800;color:#0f172a;margin-top:4px">$ ${total}</div>
        </div>
        <a href="${payUrl}" style="display:block;text-align:center;background:#009ee3;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px">Pagar con Mercado Pago</a>
        <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;text-align:center">Pago simulado · Si el botón no funciona, copiá este enlace:<br>${payUrl}</p>
      </div>
    </div>
  </div>
</body></html>`;
};

// Envía el mail de pago. Best-effort: nunca debe tumbar el alta del envío.
const sendPaymentLink = async ({ invoice, shipment, empresa = 'LogiTrack' }) => {
    const to = shipment?.sender?.email;
    if (!to || !invoice?.payToken) { return { ok: false, message: 'Sin email del remitente o token' }; }
    if (invoice.payStatus === 'PAGADA') { return { ok: false, message: 'Factura ya pagada' }; }

    const payUrl = `${baseUrl()}/pago/${invoice.payToken}`;
    await queueEmail({
        recipient: to,
        subject:   `Factura ${invoice.number} · Pagá tu envío ${shipment?.trackingId || ''}`.trim(),
        body:      buildBody({ invoice, shipment, payUrl, empresa }),
        format:    'html',
    });
    return { ok: true };
};

module.exports = { sendPaymentLink, totalConIva };
