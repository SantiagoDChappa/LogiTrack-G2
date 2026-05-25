-- Sprint 3 - 4.1: incluir codigo clave de entrega en el mail de salida a reparto.
-- Actualiza el template existente solo si todavia no contiene el placeholder.

UPDATE "logitrack"."email_template"
SET "body" = "body" || '{{secretCodeLine}}'
WHERE "eventCode"::text = 'SHIPMENT_OUT_FOR_DELIVERY'
  AND "body" NOT LIKE '%{{secretCodeLine}}%'
  AND "body" NOT LIKE '%{{secretCode}}%';
