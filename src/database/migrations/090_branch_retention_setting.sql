-- Días hábiles que un paquete queda disponible para retiro en sucursal antes de
-- volver al circuito de devolución. Lo usa el alta de envío (modalidad retiro por
-- sucursal) para estimar la ventana de retiro. Aditivo: default 10.
INSERT INTO logitrack.setting (key, value)
VALUES ('dias_retencion_sucursal', '10')
ON CONFLICT (key) DO NOTHING;
