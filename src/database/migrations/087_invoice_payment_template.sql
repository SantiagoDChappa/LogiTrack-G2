-- Plantilla editable del mail de pago simulado de la factura (INVOICE_PAYMENT_LINK).
-- Transaccional: siempre se envía (no se inserta en notification_config). El cuerpo
-- usa placeholders {{...}} para poder editarlo desde Ajustes → Comunicaciones.
-- Placeholders: {{empresaNombre}} {{invoiceNumber}} {{senderName}} {{trackingCode}}
--               {{totalAmount}} (ya formateado, con $) {{payUrl}}

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'INVOICE_PAYMENT_LINK'::"logitrack"."type_notification_event",
    'Mail de pago de factura (link de pago simulado)'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'INVOICE_PAYMENT_LINK'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body", "format")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'INVOICE_PAYMENT_LINK'::"logitrack"."type_notification_event",
    'Factura {{invoiceNumber}} · Pagá tu envío {{trackingCode}}',
    '<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#009ee3;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.9">{{empresaNombre}}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Factura {{invoiceNumber}}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>{{senderName}}</strong>,</p>
        <p style="margin:0 0 16px">Generamos la factura de tu envío <strong>{{trackingCode}}</strong>. Para completar la contratación, aboná el comprobante:</p>
        <div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 20px">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Total a pagar</div>
          <div style="font-size:30px;font-weight:800;color:#0f172a;margin-top:4px">{{totalAmount}}</div>
        </div>
        <a href="{{payUrl}}" style="display:block;text-align:center;background:#009ee3;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px">Pagar con Mercado Pago</a>
        <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;text-align:center">Pago simulado · Si el botón no funciona, copiá este enlace:<br>{{payUrl}}</p>
      </div>
    </div>
  </div>
</body></html>',
    'html'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'INVOICE_PAYMENT_LINK'
);
