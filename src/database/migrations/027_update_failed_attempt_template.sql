-- Actualiza el template de SHIPMENT_FAILED_ATTEMPT para incluir el motivo
-- del intento fallido y el enlace de autogestión (reprogramar / retirar en sucursal).

UPDATE logitrack.email_template
SET subject = 'Intento de entrega fallido – {{trackingCode}}',
    body    = 'Hola {{fullName}},

Lamentamos informarte que el repartidor intentó entregar tu paquete ({{trackingCode}}) pero no tuvo éxito.

Motivo: {{failedReason}}

Podés reprogramar la entrega o elegir retirar en sucursal desde el siguiente enlace:
{{selfServiceUrl}}

Si tenés alguna consulta, también podés escribirnos respondiendo este correo.

Saludos,
{{senderName}}'
WHERE "eventCode"::text = 'SHIPMENT_FAILED_ATTEMPT';
