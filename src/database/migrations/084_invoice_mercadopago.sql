-- Pago real con Mercado Pago (Checkout Pro). Suma a las columnas de pago simulado
-- ya existentes en invoice (payStatus/payMethod/payRef/paidAt/payToken) el id de
-- preferencia y de pago real de Mercado Pago, para correlacionar el webhook.
ALTER TABLE "logitrack"."invoice"
    ADD COLUMN IF NOT EXISTS "mpPreferenceId" VARCHAR(80),
    ADD COLUMN IF NOT EXISTS "mpPaymentId"    VARCHAR(80);

-- Idempotencia de webhooks: Mercado Pago puede reenviar la misma notificación
-- varias veces. Si el insert no entra (ya existe), el webhook se ignora.
CREATE TABLE IF NOT EXISTS "logitrack"."payment_webhook_event" (
    "mp_payment_id" VARCHAR(80) PRIMARY KEY,
    "received_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
