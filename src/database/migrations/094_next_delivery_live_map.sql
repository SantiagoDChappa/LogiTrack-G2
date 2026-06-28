-- Última Milla — el aviso "ya casi llego" (SHIPMENT_NEXT_DELIVERY) ahora enlaza a la
-- página de MAPA EN VIVO dedicada ({{liveMapUrl}}) en vez del portal de seguimiento
-- genérico ({{trackingUrl}}). Esa página muestra el punto de entrega + la ubicación del
-- repartidor moviéndose en tiempo real.
-- Idempotente: corre en cada deploy. Sólo reemplaza el token en la línea del mapa, así no
-- pisa otras ediciones del usuario y no se re-aplica una vez hecho.
UPDATE logitrack.email_template
   SET "body" = REPLACE(
                    "body",
                    'Seguí al repartidor en el mapa en vivo: {{trackingUrl}}',
                    'Seguí al repartidor en el mapa en vivo: {{liveMapUrl}}'
                )
 WHERE "eventCode"::text = 'SHIPMENT_NEXT_DELIVERY'
   AND "body" LIKE '%Seguí al repartidor en el mapa en vivo: {{trackingUrl}}%';
