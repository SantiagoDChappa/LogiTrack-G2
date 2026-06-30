-- Vincula el envío con el transporte que lo llevó (para métricas por camioneta en el dashboard analítico)
ALTER TABLE logitrack.shipment ADD COLUMN IF NOT EXISTS "transportId" INTEGER REFERENCES logitrack.transport(id);
