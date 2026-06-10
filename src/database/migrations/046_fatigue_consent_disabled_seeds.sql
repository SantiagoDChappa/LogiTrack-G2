-- LGT-195: seeds del evento FATIGUE_DRIVER_DISABLED_CONSENT.
-- - notification_events: catálogo (descripción visible en Ajustes).
-- - notification_config: toggle on/off (parametrizable por el admin). Los destinatarios
--   son fijos por regla de negocio (Supervisores de la sucursal del transportista + admins),
--   por eso el recipient_mode queda en 'recipient' como placeholder y el service lo ignora.
-- - email_template: plantilla por defecto editable desde el modal de Comunicaciones.
--   Placeholders: {{transportistaNombre}}, {{transportistaId}}, {{sucursalNombre}},
--   {{sucursalId}}, {{rutaId}}, {{rechazos}}, {{maxRechazos}}, {{motivoInhabilitacion}}.

INSERT INTO logitrack.notification_events ("id", "code", "description")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.notification_events) + 1,
    'FATIGUE_DRIVER_DISABLED_CONSENT'::"logitrack"."type_notification_event",
    'Transportista inhabilitado por rechazar el consentimiento de fatiga'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_events WHERE "code"::text = 'FATIGUE_DRIVER_DISABLED_CONSENT'
);

INSERT INTO logitrack.notification_config ("eventCode", "enabled", "recipient_mode")
SELECT 'FATIGUE_DRIVER_DISABLED_CONSENT'::"logitrack"."type_notification_event", true, 'recipient'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.notification_config WHERE "eventCode"::text = 'FATIGUE_DRIVER_DISABLED_CONSENT'
);

INSERT INTO logitrack.email_template ("id", "eventCode", "subject", "body")
SELECT
    (SELECT COALESCE(MAX("id"), 0) FROM logitrack.email_template) + 1,
    'FATIGUE_DRIVER_DISABLED_CONSENT'::"logitrack"."type_notification_event",
    '[LogiTrack] Transportista inhabilitado por fatiga — {{transportistaNombre}}',
    'Hola,

El transportista {{transportistaNombre}} (ID #{{transportistaId}}) quedó inhabilitado
para iniciar nuevas rutas porque rechazó el consentimiento del control de fatiga
{{rechazos}} vez/veces (límite parametrizado: {{maxRechazos}}).

Sucursal asignada: {{sucursalNombre}} (ID #{{sucursalId}})
Ruta del último rechazo: #{{rutaId}}
Motivo registrado: {{motivoInhabilitacion}}

El conductor no podrá salir a reparto hasta que un Supervisor lo restablezca desde el
panel de Ojo de Patrón: /fatigue

Este aviso es automático y se envió a los Supervisores de la sucursal asignada al
transportista y a los administradores.

Saludos,
LogiTrack'
WHERE NOT EXISTS (
    SELECT 1 FROM logitrack.email_template WHERE "eventCode"::text = 'FATIGUE_DRIVER_DISABLED_CONSENT'
);
