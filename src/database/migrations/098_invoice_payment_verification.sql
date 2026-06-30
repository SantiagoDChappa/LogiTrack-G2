-- Pago simulado de efectivo (Pago Fácil) y transferencia desde el link público:
-- el remitente reporta el pago / sube el comprobante, queda "en verificación"
-- hasta que un operador/supervisor lo confirma desde el detalle del envío.
ALTER TABLE logitrack.invoice ADD COLUMN IF NOT EXISTS "pendingVerificationMethod" VARCHAR(20);
ALTER TABLE logitrack.invoice ADD COLUMN IF NOT EXISTS "pendingVerificationAt" TIMESTAMP;
ALTER TABLE logitrack.invoice ADD COLUMN IF NOT EXISTS "comprobanteData" TEXT;
ALTER TABLE logitrack.invoice ADD COLUMN IF NOT EXISTS "comprobanteMime" VARCHAR(50);
ALTER TABLE logitrack.invoice ADD COLUMN IF NOT EXISTS "comprobanteFileName" VARCHAR(200);
