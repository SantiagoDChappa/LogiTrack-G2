// [prototype] Mail al remitente con el link de pago simulado de la factura.
// Se encola con queueEmail (mismo mailer que el resto). El cuerpo sale de la
// plantilla editable INVOICE_PAYMENT_LINK (Ajustes → Comunicaciones); si no está
// cargada, cae al HTML por defecto de acá. Transaccional: siempre se envía, no
// depende del toggle de notificaciones. El link lleva al checkout público
// /pago/:payToken (estilo Mercado Pago, sin login).
const { queueEmail } = require('./notification/notificationEmailService');
const { baseUrl, render } = require('./notificationPlaceholders');
const { NotificationEvent } = require('../constants/enums');
const emailTemplateModel = require('../models/emailTemplate');

const fmt = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Calcula el total con IVA igual que la vista de factura (neto + 21%).
const totalConIva = (invoice) => {
    const neto = Number(invoice.subtotal || invoice.amount || 0);
    return Number((neto * 1.21).toFixed(2));
};

const buildBody = ({ invoice, shipment, payUrl, empresa, cancellationHours = 48 }) => {
    const total = fmt(totalConIva(invoice));
    const sender = invoice.senderName || shipment?.sender?.fullName || 'Cliente';
    const tracking = shipment?.trackingId || '';
    const recipientName = shipment?.recipient?.fullName || '';
    const shipmentTypeName = shipment?.shipmentType?.description || shipment?.shipmentType?.name || '';
    let deliveryLine = '';
    if (shipment?.deliveryMode === 'branch') {
        deliveryLine = 'Retiro en sucursal';
    } else if (shipment?.address) {
        const a = shipment.address;
        deliveryLine = [a.street, a.number, a.province?.name].filter(Boolean).join(', ');
    }

    const infoRows = [
        recipientName   && `<tr><td style="color:#64748b;padding:4px 0;font-size:13px">Destinatario</td><td style="font-weight:600;padding:4px 0 4px 12px;font-size:13px">${recipientName}</td></tr>`,
        deliveryLine    && `<tr><td style="color:#64748b;padding:4px 0;font-size:13px">Entrega</td><td style="font-weight:600;padding:4px 0 4px 12px;font-size:13px">${deliveryLine}</td></tr>`,
        shipmentTypeName && `<tr><td style="color:#64748b;padding:4px 0;font-size:13px">Tipo</td><td style="font-weight:600;padding:4px 0 4px 12px;font-size:13px">${shipmentTypeName}</td></tr>`,
    ].filter(Boolean).join('');

    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#009ee3;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.9">${empresa}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Factura ${invoice.number}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>${sender}</strong>,</p>
        <p style="margin:0 0 16px">Generamos la factura de tu envío <strong>${tracking}</strong>. Ingresá al siguiente enlace para elegir cómo pagar:</p>
        ${infoRows ? `<table style="width:100%;border-collapse:collapse;margin:0 0 16px">${infoRows}</table>` : ''}
        <div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 20px">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Total a pagar</div>
          <div style="font-size:30px;font-weight:800;color:#0f172a;margin-top:4px">$ ${total}</div>
        </div>
        <a href="${payUrl}" style="display:block;text-align:center;background:#009ee3;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px">Ver opciones de pago</a>
        <div style="margin:16px 0 0;font-size:12.5px;color:#64748b;text-align:center;line-height:1.6">
          Podés pagar con <strong>Mercado Pago</strong>, <strong>efectivo (Pago Fácil)</strong> o <strong>transferencia bancaria</strong>.
        </div>
        <div style="margin:16px 0 0;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#92400e;text-align:center">
          ⚠️ Si no se confirma el pago dentro de las <strong>${cancellationHours} horas</strong>, el envío será cancelado automáticamente.
        </div>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">Si el botón no funciona, copiá este enlace:<br>${payUrl}</p>
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
    const sender = invoice.senderName || shipment?.sender?.fullName || 'Cliente';
    const tracking = shipment?.trackingId || '';

    const { DEFAULT_HOURS, readThresholdHours } = require('../jobs/pendingPaymentCancellationJob');
    let cancellationHours = DEFAULT_HOURS;
    try { cancellationHours = await readThresholdHours(); } catch { /* usa default */ }

    const recipientName = shipment?.recipient?.fullName || '';
    const shipmentTypeName = shipment?.shipmentType?.description || shipment?.shipmentType?.name || '';
    let deliveryLine = '';
    if (shipment?.deliveryMode === 'branch') {
        deliveryLine = 'Retiro en sucursal';
    } else if (shipment?.address) {
        const a = shipment.address;
        deliveryLine = [a.street, a.number, a.province?.name].filter(Boolean).join(', ');
    }

    // Variables para la plantilla editable.
    const vars = {
        empresaNombre:     empresa,
        invoiceNumber:     invoice.number,
        senderName:        sender,
        trackingCode:      tracking,
        totalAmount:       `$ ${fmt(totalConIva(invoice))}`,
        payUrl,
        recipientName,
        deliveryAddress:   deliveryLine,
        shipmentType:      shipmentTypeName,
        cancellationHours: String(cancellationHours),
    };

    // Plantilla editable; fallback al HTML por defecto si no está cargada.
    let subject = `Factura ${invoice.number} · Pagá tu envío ${tracking}`.trim();
    let body = buildBody({ invoice, shipment, payUrl, empresa, cancellationHours });
    let format = 'html';
    try {
        const tpl = await emailTemplateModel.getDefaultByEventCode(NotificationEvent.INVOICE_PAYMENT_LINK);
        if (tpl) {
            subject = render(tpl.subject, vars) || subject;
            body    = render(tpl.body, vars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn('[invoicePaymentEmail] plantilla no disponible, uso HTML por defecto:', err.message);
    }

    await queueEmail({ recipient: to, subject, body, format });
    return { ok: true };
};

// Avisa al remitente que su envío fue cancelado por falta de pago.
const sendPaymentCancelled = async ({ invoice, shipment, empresa = 'LogiTrack' }) => {
    const to = shipment?.sender?.email;
    if (!to) { return { ok: false, message: 'Sin email del remitente' }; }

    const tracking = shipment?.trackingId || '';
    const sender = invoice?.senderName || shipment?.sender?.fullName || 'Cliente';
    const total = invoice ? fmt(totalConIva(invoice)) : '';

    const vars = {
        empresaNombre: empresa,
        senderName:    sender,
        trackingCode:  tracking,
        totalAmount:   total ? `$ ${total}` : '',
    };

    let subject = `Envío ${tracking} cancelado por falta de pago`.trim();
    let body = `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#64748b;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.85">${empresa}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Envío cancelado</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>${sender}</strong>,</p>
        <p style="margin:0 0 16px">Tu envío <strong>${tracking}</strong> fue <strong>cancelado automáticamente</strong> porque no recibimos la confirmación del pago dentro del plazo establecido.</p>
        ${total ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 20px;text-align:center">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Monto no cobrado</div>
          <div style="font-size:26px;font-weight:800;color:#0f172a;margin-top:4px">$ ${total}</div>
        </div>` : ''}
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;font-size:13px;color:#991b1b;line-height:1.6">
          Si todavía querés realizar el envío, contactate con nosotros para volver a gestionar el servicio.
        </div>
      </div>
    </div>
  </div>
</body></html>`;
    let format = 'html';
    try {
        const tpl = await emailTemplateModel.getDefaultByEventCode(NotificationEvent.INVOICE_PAYMENT_CANCELLED);
        if (tpl) {
            subject = render(tpl.subject, vars) || subject;
            body    = render(tpl.body, vars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn('[invoicePaymentEmail] plantilla cancelación no disponible:', err.message);
    }

    await queueEmail({ recipient: to, subject, body, format });
    return { ok: true };
};

// Avisa al remitente que su comprobante fue rechazado y puede reintentar.
const sendComprobanteRejected = async ({ invoice, shipment, empresa = 'LogiTrack' }) => {
    const to = shipment?.sender?.email;
    if (!to || !invoice?.payToken) { return { ok: false, message: 'Sin email del remitente o token' }; }

    const payUrl = `${baseUrl()}/pago/${invoice.payToken}`;
    const sender = invoice.senderName || shipment?.sender?.fullName || 'Cliente';
    const tracking = shipment?.trackingId || '';
    const total = fmt(totalConIva(invoice));

    const vars = {
        empresaNombre: empresa,
        senderName:    sender,
        trackingCode:  tracking,
        totalAmount:   `$ ${total}`,
        payUrl,
    };

    let subject = `Comprobante rechazado · Envío ${tracking}`.trim();
    let body = `<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#dc2626;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.85">${empresa}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Comprobante rechazado</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>${sender}</strong>,</p>
        <p style="margin:0 0 16px">El comprobante que enviaste para el pago de tu envío <strong>${tracking}</strong> no pudo ser verificado.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:0 0 20px;font-size:13px;color:#991b1b">
          Por favor volvé a intentarlo asegurándote de que la imagen o PDF sea legible y corresponda al pago de <strong>$ ${total}</strong>.
        </div>
        <a href="${payUrl}" style="display:block;text-align:center;background:#009ee3;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px">Reintentar pago</a>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">Si el botón no funciona, copiá este enlace:<br>${payUrl}</p>
      </div>
    </div>
  </div>
</body></html>`;
    let format = 'html';
    try {
        const tpl = await emailTemplateModel.getDefaultByEventCode(NotificationEvent.INVOICE_COMPROBANTE_REJECTED);
        if (tpl) {
            subject = render(tpl.subject, vars) || subject;
            body    = render(tpl.body, vars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn('[invoicePaymentEmail] plantilla rechazo no disponible:', err.message);
    }

    await queueEmail({ recipient: to, subject, body, format });
    return { ok: true };
};

module.exports = { sendPaymentLink, sendPaymentCancelled, sendComprobanteRejected, totalConIva };
