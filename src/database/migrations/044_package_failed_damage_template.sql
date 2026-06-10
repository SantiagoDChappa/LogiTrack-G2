-- Plantilla del aviso que se envía cuando un paquete llega dañado y se genera
-- automáticamente la incidencia (estado SHIPMENT_PACKAGE_FAILED).
-- El enlace {{incidentUrl}} lleva DIRECTO a la incidencia creada (no al alta de una
-- nueva); {{incidentId}} se resuelve al enviar (última incidencia del envío).

UPDATE logitrack.email_template
SET subject = 'Tu paquete sufrió un daño — incidencia #{{incidentId}} ({{trackingCode}})',
    body    = 'Hola {{fullName}},

Lamentamos informarte que tu paquete {{trackingCode}} sufrió un daño y no pudo entregarse.

Generamos automáticamente la incidencia #{{incidentId}} para gestionarlo. Podés ver el detalle y, si corresponde, elegir cómo resolverlo (reembolso o reemplazo) desde el portal:
{{incidentUrl}}

Si tenés alguna consulta, podés escribirnos respondiendo este correo.

Saludos,
{{senderName}}'
WHERE "eventCode"::text = 'SHIPMENT_PACKAGE_FAILED';
