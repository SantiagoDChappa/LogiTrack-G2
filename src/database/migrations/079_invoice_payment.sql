-- [prototype] Pago simulado de la factura. Al crear el envío se manda un mail al
-- remitente con un link público (/pago/:payToken); si "paga", la factura queda PAGADA.
-- No es un cobro real: simula el checkout de Mercado Pago para la demo del TP.
ALTER TABLE "logitrack"."invoice"
    ADD COLUMN IF NOT EXISTS "payStatus" VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE',  -- PENDIENTE | PAGADA
    ADD COLUMN IF NOT EXISTS "payMethod" VARCHAR(20),                                 -- mercadopago | efectivo | transferencia
    ADD COLUMN IF NOT EXISTS "payRef"    VARCHAR(40),                                 -- id simulado, ej MP-7F3K9
    ADD COLUMN IF NOT EXISTS "paidAt"    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "payToken"  VARCHAR(60);

-- Token único para el link de pago (uno por factura).
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_invoice_pay_token"
    ON "logitrack"."invoice" ("payToken") WHERE "payToken" IS NOT NULL;
