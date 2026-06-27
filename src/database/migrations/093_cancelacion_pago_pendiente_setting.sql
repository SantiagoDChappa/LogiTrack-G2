-- Horas que un envío puede quedar en "Pendiente de Pago" antes de cancelarse
-- automáticamente (cron). Configurable desde Ajustes → General. Default: 48hs.
INSERT INTO logitrack.setting (key, value)
VALUES ('horas_cancelacion_pago_pendiente', '48')
ON CONFLICT (key) DO NOTHING;
