-- Seeds de los avisos de fatiga (catálogo + toggle + plantilla editable).
-- Destinatarios fijos por regla de negocio: Supervisores de la sucursal asignada al
-- transportista + administradores (el service los resuelve; recipient_mode es placeholder).
-- Tokens disponibles: {{transportistaNombre}}, {{transportistaId}}, {{sucursalNombre}},
-- {{sucursalId}}, {{rutaId}}, {{score}}, {{minutos}}, {{rechazos}}, {{maxRechazos}},
-- {{ventanaCantidad}}, {{ventanaDias}}.

-- ── notification_events (descripción visible en Ajustes) ─────────────────────
INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
       'FATIGUE_ROUTE_BLOCKED'::"logitrack"."type_notification_event",
       'Fatiga: ruta bloqueada por no superar el control'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_ROUTE_BLOCKED');

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
       'FATIGUE_REVIEW_NO_BLOCK'::"logitrack"."type_notification_event",
       'Fatiga: control no superado sin bloqueo automático (revisar)'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_REVIEW_NO_BLOCK');

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
       'FATIGUE_RECHECK_OMITTED'::"logitrack"."type_notification_event",
       'Fatiga: re-chequeo en ruta no realizado a tiempo'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_RECHECK_OMITTED');

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
       'FATIGUE_CONSENT_REJECTED'::"logitrack"."type_notification_event",
       'Fatiga: el transportista rechazó el consentimiento'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_CONSENT_REJECTED');

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
       'FATIGUE_PATTERN_RECURRENT'::"logitrack"."type_notification_event",
       'Fatiga: patrón recurrente detectado'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_PATTERN_RECURRENT');

-- ── notification_config (toggle on/off; default ON) ─────────────────────────
INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_ROUTE_BLOCKED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_ROUTE_BLOCKED');

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_REVIEW_NO_BLOCK'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_REVIEW_NO_BLOCK');

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_RECHECK_OMITTED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_RECHECK_OMITTED');

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_CONSENT_REJECTED'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_CONSENT_REJECTED');

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_PATTERN_RECURRENT'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_PATTERN_RECURRENT');

-- ── email_template (plantilla por defecto editable) ─────────────────────────
INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
       'FATIGUE_ROUTE_BLOCKED'::"logitrack"."type_notification_event",
       '[LogiTrack] Ruta #{{rutaId}} bloqueada por fatiga — {{transportistaNombre}}',
       'Hola,

Se bloqueó la ruta #{{rutaId}} porque el transportista {{transportistaNombre}} no superó el control de fatiga.

Sucursal asignada: {{sucursalNombre}}
Score del control: {{score}}

Gestioná el caso (liberar, inhabilitar o reasignar) en el panel de Ojo de Patrón: /fatigue

Este aviso es automático para los Supervisores de la sucursal asignada al transportista y los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_ROUTE_BLOCKED');

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
       'FATIGUE_REVIEW_NO_BLOCK'::"logitrack"."type_notification_event",
       '[LogiTrack] Fatiga sin bloqueo — Ruta #{{rutaId}} ({{transportistaNombre}})',
       'Hola,

El transportista {{transportistaNombre}} NO superó el control de fatiga en la ruta #{{rutaId}}, pero el bloqueo automático está desactivado, así que salió a ruta.

Sucursal asignada: {{sucursalNombre}}
Score del control: {{score}}

Decidí si inhabilitarlo o reasignar la ruta en el panel: /fatigue

Este aviso es automático para los Supervisores de la sucursal asignada al transportista y los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_REVIEW_NO_BLOCK');

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
       'FATIGUE_RECHECK_OMITTED'::"logitrack"."type_notification_event",
       '[LogiTrack] Re-chequeo de fatiga sin realizar — Ruta #{{rutaId}}',
       'Hola,

El transportista {{transportistaNombre}} no completó el re-chequeo de fatiga pedido en la ruta #{{rutaId}} (más de {{minutos}} minutos sin hacerlo).

Sucursal asignada: {{sucursalNombre}}

Revisá el caso (contactar, inhabilitar o reasignar) en el panel: /fatigue

Este aviso es automático para los Supervisores de la sucursal asignada al transportista y los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_RECHECK_OMITTED');

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
       'FATIGUE_CONSENT_REJECTED'::"logitrack"."type_notification_event",
       '[LogiTrack] Rechazo de consentimiento de fatiga — {{transportistaNombre}}',
       'Hola,

El transportista {{transportistaNombre}} (ID #{{transportistaId}}) rechazó el consentimiento del control de fatiga en la ruta #{{rutaId}}.

Rechazos acumulados: {{rechazos}} de {{maxRechazos}} (al alcanzar el límite queda inhabilitado).
Sucursal asignada: {{sucursalNombre}}

Seguí el caso en el panel de Ojo de Patrón: /fatigue

Este aviso es automático para los Supervisores de la sucursal asignada al transportista y los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_CONSENT_REJECTED');

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
       'FATIGUE_PATTERN_RECURRENT'::"logitrack"."type_notification_event",
       '[LogiTrack] Patrón de fatiga recurrente — Transportista #{{transportistaId}}',
       'Hola,

Se detectó un patrón de fatiga recurrente en el transportista #{{transportistaId}}: {{ventanaCantidad}} bloqueos en {{ventanaDias}} días.

Sucursal asignada: {{sucursalNombre}}

Revisalo en el panel de Ojo de Patrón: /fatigue

Este aviso es automático para los Supervisores de la sucursal asignada al transportista y los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_PATTERN_RECURRENT');
