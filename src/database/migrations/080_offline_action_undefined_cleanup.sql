-- [prototype] Limpieza del bug de sync offline: el cliente mandaba el header
-- Idempotency-Key como string literal "undefined" (listOutbox no exponía idempotencyKey).
-- La primera acción sincronizada registró una fila con idempotencyKey='undefined' y a partir
-- de ahí TODA acción colisionaba contra esa fila → dedupe → nunca se aplicaba.
-- Ya corregido en cliente (offline-db.js). Acá borramos la(s) fila(s) envenenada(s) para
-- que no sigan deduplicando. Idempotente: corre en cada arranque.
DELETE FROM "logitrack"."offline_action" WHERE "idempotencyKey" IN ('undefined', 'null', '');
