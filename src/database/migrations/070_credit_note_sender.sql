-- La nota de crédito por reembolso se emite al REMITENTE (quien contrató y pagó el
-- envío). Guardamos sus datos fiscales al momento de generarla.
ALTER TABLE "logitrack"."credit_note"
    ADD COLUMN IF NOT EXISTS "senderName"     VARCHAR(120),
    ADD COLUMN IF NOT EXISTS "senderDocument" VARCHAR(30);
