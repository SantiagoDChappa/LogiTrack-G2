-- CP-SEGC08 (LGT-167) — el aviso de cambio de estado de incidencia debe llegar al
-- cliente que la reportó, sea remitente o destinatario del envío.
-- Pasamos el recipient_mode de INCIDENT_STATUS_CHANGE a 'both'.

UPDATE logitrack.notification_config
   SET "recipient_mode" = 'both'
 WHERE "eventCode"::text = 'INCIDENT_STATUS_CHANGE';
