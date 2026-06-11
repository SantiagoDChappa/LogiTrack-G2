-- Versiones HTML de las plantillas de fatiga. Solo convierte las que siguen en 'text'
-- (no pisa personalizaciones posteriores). Tokens: {{transportistaNombre}},
-- {{transportistaId}}, {{sucursalNombre}}, {{rutaId}}, {{score}}, {{minutos}},
-- {{rechazos}}, {{maxRechazos}}, {{ventanaCantidad}}, {{ventanaDias}}, {{panelUrl}}.

-- ── Ruta bloqueada (rojo) ───────────────────────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Ruta #{{rutaId}} bloqueada por fatiga — {{transportistaNombre}}',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#dc2626,#b91c1c);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">🚫 Ruta #{{rutaId}} bloqueada</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;">El transportista <strong style="color:#0f172a;">{{transportistaNombre}}</strong> no superó el control de fatiga y la ruta quedó <strong>bloqueada</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;">Sucursal asignada</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">{{sucursalNombre}}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">Score del control</td><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">{{score}}</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#dc2626;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Gestionar en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_ROUTE_BLOCKED' AND "format" = 'text';

-- ── Sin bloqueo, revisar (ámbar) ────────────────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Fatiga sin bloqueo — Ruta #{{rutaId}} ({{transportistaNombre}})',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#d97706,#b45309);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">⚠️ Control no superado (sin bloqueo)</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;"><strong style="color:#0f172a;">{{transportistaNombre}}</strong> no superó el control de fatiga en la ruta <strong>#{{rutaId}}</strong>, pero el bloqueo automático está desactivado y salió a ruta. Revisá si conviene inhabilitarlo o reasignar.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
<tr><td style="padding:12px 16px;font-size:13px;color:#92400e;">Sucursal asignada</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">{{sucursalNombre}}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #fde68a;font-size:13px;color:#92400e;">Score del control</td><td style="padding:12px 16px;border-top:1px solid #fde68a;font-size:13px;color:#b45309;font-weight:700;text-align:right;">{{score}}</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#d97706;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Revisar en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_REVIEW_NO_BLOCK' AND "format" = 'text';

-- ── Re-chequeo no realizado (ámbar) ─────────────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Re-chequeo de fatiga sin realizar — Ruta #{{rutaId}}',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#d97706,#b45309);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">⏱️ Re-chequeo sin realizar</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;"><strong style="color:#0f172a;">{{transportistaNombre}}</strong> no completó el re-chequeo de fatiga pedido en la ruta <strong>#{{rutaId}}</strong> (más de <strong>{{minutos}}</strong> minutos sin hacerlo).</p>
<div style="margin:0 0 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e;">Sucursal asignada: <strong style="color:#0f172a;">{{sucursalNombre}}</strong>. Contactá al conductor, inhabilitá o reasigná la ruta.</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#d97706;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Gestionar en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_RECHECK_OMITTED' AND "format" = 'text';

-- ── Rechazo de consentimiento (ámbar) ───────────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Rechazo de consentimiento de fatiga — {{transportistaNombre}}',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#d97706,#b45309);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">✋ Consentimiento rechazado</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;"><strong style="color:#0f172a;">{{transportistaNombre}}</strong> (ID #{{transportistaId}}) rechazó el consentimiento del control de fatiga en la ruta <strong>#{{rutaId}}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
<tr><td style="padding:12px 16px;font-size:13px;color:#92400e;">Sucursal asignada</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">{{sucursalNombre}}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #fde68a;font-size:13px;color:#92400e;">Rechazos acumulados</td><td style="padding:12px 16px;border-top:1px solid #fde68a;font-size:13px;color:#b45309;font-weight:700;text-align:right;">{{rechazos}} / {{maxRechazos}}</td></tr></table>
<p style="margin:0 0 20px;font-size:13px;color:#64748b;">Al alcanzar el límite, el transportista queda inhabilitado automáticamente.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#d97706;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Ver en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_CONSENT_REJECTED' AND "format" = 'text';

-- ── Inhabilitado por consentimiento (rojo) ──────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Transportista inhabilitado por fatiga — {{transportistaNombre}}',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#dc2626,#b91c1c);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">🚷 Transportista inhabilitado</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;"><strong style="color:#0f172a;">{{transportistaNombre}}</strong> (ID #{{transportistaId}}) quedó <strong>inhabilitado</strong> tras rechazar el consentimiento {{rechazos}}/{{maxRechazos}} vez/veces. No podrá salir a reparto hasta que un Supervisor lo restablezca.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;">Sucursal asignada</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">{{sucursalNombre}}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">Ruta del último rechazo</td><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">#{{rutaId}}</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">Motivo</td><td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#dc2626;font-weight:600;text-align:right;">{{motivoInhabilitacion}}</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#dc2626;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Restablecer en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_DRIVER_DISABLED_CONSENT' AND "format" = 'text';

-- ── Patrón recurrente (rojo) ────────────────────────────────────────────────
UPDATE logitrack.email_template SET "format" = 'html',
"subject" = '[LogiTrack] Patrón de fatiga recurrente — Transportista #{{transportistaId}}',
"body" = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.35);">
<tr><td style="background-image:linear-gradient(135deg,#dc2626,#b91c1c);padding:26px 32px;text-align:center;">
<span style="display:inline-block;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">Ojo de Patrón · Fatiga</span>
<h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;">🔁 Patrón de fatiga recurrente</h1></td></tr>
<tr><td style="padding:30px 32px;color:#475569;font-size:14px;line-height:1.6;">
<p style="margin:0 0 16px;">Se detectó un patrón recurrente en <strong style="color:#0f172a;">{{transportistaNombre}}</strong> (#{{transportistaId}}): <strong>{{ventanaCantidad}}</strong> bloqueos en <strong>{{ventanaDias}}</strong> días.</p>
<div style="margin:0 0 20px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;font-size:13px;color:#991b1b;">Sucursal asignada: <strong style="color:#0f172a;">{{sucursalNombre}}</strong>. Conviene revisar la situación del transportista.</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:10px;background:#dc2626;"><a href="{{panelUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Revisar en el panel</a></td></tr></table></td></tr>
<tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Aviso automático para Supervisores de la sucursal del transportista y administradores.</p></td></tr>
</table></td></tr></table></body></html>'
WHERE "eventCode"::text = 'FATIGUE_PATTERN_RECURRENT' AND "format" = 'text';
