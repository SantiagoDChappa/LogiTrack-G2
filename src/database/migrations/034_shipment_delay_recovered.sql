-- LGT-160 Esc.6 — evento de recuperación de demora.
-- ADD VALUE va en su propio archivo (Postgres no permite usar el nuevo valor del
-- enum en la misma transacción donde se agrega). Los seeds van en 035.

ALTER TYPE "logitrack"."type_notification_event" ADD VALUE IF NOT EXISTS 'SHIPMENT_DELAY_RECOVERED';
