-- Migration 003
-- Agrega columna active para manejo de alta/baja de usuarios.
-- Idempotente: seguro de re-ejecutar.

ALTER TABLE "logitrack"."user"
    ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
