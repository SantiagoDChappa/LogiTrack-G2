-- LGT-204 — Seeds del evento SHIPMENT_PACKAGE_DAMAGED (paquete roto o dañado).
-- Crea notification_events + notification_config + email_template (HTML), idempotente.
-- recipient_mode = 'sender': el aviso va al remitente, que elige reembolso o reemplazo.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.notification_events) + 1,
       'SHIPMENT_PACKAGE_DAMAGED'::"logitrack"."type_notification_event",
       'Paquete roto o dañado'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'SHIPMENT_PACKAGE_DAMAGED');

INSERT INTO logitrack.notification_config ("eventCode","enabled","recipient_mode")
SELECT 'SHIPMENT_PACKAGE_DAMAGED'::"logitrack"."type_notification_event", true, 'sender'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_DAMAGED');

INSERT INTO logitrack.email_template ("id","eventCode","subject","body","format","name","isDefault")
SELECT (SELECT COALESCE(MAX("id"),0) FROM logitrack.email_template) + 1,
       'SHIPMENT_PACKAGE_DAMAGED'::"logitrack"."type_notification_event",
       'Tu paquete {{trackingCode}} llegó con daño — elegí reembolso o reemplazo',
       '<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
        <tr><td style="background-image:linear-gradient(135deg,#dc2626,#b91c1c);padding:28px 32px;text-align:center;">
          <span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Paquete dañado</span>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Tu paquete llegó con daño</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#475569;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 16px;">Hola <strong style="color:#0f172a;">{{senderName}}</strong>, registramos que el paquete del envío <strong style="color:#0f172a;">{{trackingCode}}</strong> llegó con daño. Abrimos la incidencia <strong style="color:#0f172a;">#{{incidentId}}</strong> para resolverlo.</p>
          <div style="margin:0;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;color:#991b1b;font-size:14px;">Como remitente, podés elegir entre <strong>reembolso</strong> (cancelamos el envío) o <strong>reemplazo</strong> (generamos uno nuevo con prioridad alta).</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr><td style="border-radius:10px;background:#dc2626;"><a href="{{incidentUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Elegí reembolso o reemplazo</a></td></tr></table>
          <p style="margin:20px 0 0;color:#64748b;font-size:13px;">Si no podés ver el botón, ingresá a "Mis envíos" en el portal y abrí la incidencia #{{incidentId}}.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Incidencia #{{incidentId}} · Seguimiento {{trackingCode}}</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
       'html', 'Principal', true
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_DAMAGED');
