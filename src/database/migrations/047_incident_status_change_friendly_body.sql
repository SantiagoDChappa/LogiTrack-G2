-- Actualiza el template INCIDENT_STATUS_CHANGE para que incluya el comentario que dejó
-- el operador ({{incidentComentario}}) y un mensaje más amigable al cliente.
-- Idempotente: solo actualiza la fila existente; si fue editada manualmente desde
-- Ajustes (subject distinto al seed original) se respeta para no pisar customizaciones.

UPDATE logitrack.email_template
   SET "subject" = 'Actualización de tu incidencia #{{incidentId}} — {{trackingCode}}',
       "body"   = 'Hola {{fullName}},

Te escribimos por la incidencia #{{incidentId}} de tu envío {{trackingCode}}.

Estado actual: {{incidentEstado}}

Comentario del equipo:
{{incidentComentario}}

Si necesitás más información, podés responder este correo o contactarnos.

Podés ver el detalle desde el portal:
{{trackingUrl}}

Saludos,
{{senderName}}'
 WHERE "eventCode"::text = 'INCIDENT_STATUS_CHANGE'
   AND "subject" = 'Actualización de tu incidencia #{{incidentId}} — {{trackingCode}}'
   AND "body" NOT LIKE '%incidentComentario%';
