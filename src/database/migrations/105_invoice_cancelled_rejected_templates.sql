-- Plantillas editables para cancelación por falta de pago y rechazo de comprobante.
-- Placeholders disponibles para INVOICE_PAYMENT_CANCELLED: {{empresaNombre}} {{senderName}} {{trackingCode}} {{totalAmount}}
-- Placeholders disponibles para INVOICE_COMPROBANTE_REJECTED: {{empresaNombre}} {{senderName}} {{trackingCode}} {{totalAmount}} {{payUrl}}

-- notification_events
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'INVOICE_PAYMENT_CANCELLED'::"logitrack"."type_notification_event",
    'Mail al remitente cuando el envío se cancela por falta de pago'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'INVOICE_PAYMENT_CANCELLED'
);

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'INVOICE_COMPROBANTE_REJECTED'::"logitrack"."type_notification_event",
    'Mail al remitente cuando el operador rechaza su comprobante de pago'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'INVOICE_COMPROBANTE_REJECTED'
);

-- email_template — cancelación por falta de pago
INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body", "format")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'INVOICE_PAYMENT_CANCELLED'::"logitrack"."type_notification_event",
    'Envío {{trackingCode}} cancelado por falta de pago',
    '<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#64748b;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.85">{{empresaNombre}}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Envío cancelado</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>{{senderName}}</strong>,</p>
        <p style="margin:0 0 16px">Tu envío <strong>{{trackingCode}}</strong> fue <strong>cancelado automáticamente</strong> porque no recibimos la confirmación del pago dentro del plazo establecido.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 20px;text-align:center">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Monto no cobrado</div>
          <div style="font-size:26px;font-weight:800;color:#0f172a;margin-top:4px">{{totalAmount}}</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;font-size:13px;color:#991b1b;line-height:1.6">
          Si todavía querés realizar el envío, contactate con nosotros para volver a gestionar el servicio.
        </div>
      </div>
    </div>
  </div>
</body></html>',
    'html'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'INVOICE_PAYMENT_CANCELLED'
);

-- email_template — rechazo de comprobante
INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body", "format")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'INVOICE_COMPROBANTE_REJECTED'::"logitrack"."type_notification_event",
    'Comprobante rechazado · Envío {{trackingCode}}',
    '<!DOCTYPE html><html><body style="margin:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
      <div style="background:#dc2626;color:#fff;padding:20px 24px">
        <div style="font-size:13px;opacity:.85">{{empresaNombre}}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Comprobante rechazado</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hola <strong>{{senderName}}</strong>,</p>
        <p style="margin:0 0 16px">El comprobante que enviaste para el pago de tu envío <strong>{{trackingCode}}</strong> no pudo ser verificado.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:0 0 20px;font-size:13px;color:#991b1b">
          Por favor volvé a intentarlo asegurándote de que la imagen o PDF sea legible y corresponda al pago de <strong>{{totalAmount}}</strong>.
        </div>
        <a href="{{payUrl}}" style="display:block;text-align:center;background:#009ee3;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:10px">Reintentar pago</a>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">Si el botón no funciona, copiá este enlace:<br>{{payUrl}}</p>
      </div>
    </div>
  </div>
</body></html>',
    'html'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'INVOICE_COMPROBANTE_REJECTED'
);
