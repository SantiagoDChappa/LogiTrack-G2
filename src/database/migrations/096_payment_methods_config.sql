-- Configuración de cobros: datos bancarios de la empresa (referencia interna para
-- el operador cuando coordina una transferencia) + qué medios de pago están
-- habilitados. Todos arrancan habilitados por defecto (no cambia nada existente).
INSERT INTO logitrack.setting (key, value) VALUES
    ('cbu_empresa', ''),
    ('alias_empresa', ''),
    ('titular_empresa', ''),
    ('banco_empresa', ''),
    ('medio_pago_mercadopago_habilitado', 'true'),
    ('medio_pago_efectivo_habilitado', 'true'),
    ('medio_pago_transferencia_habilitado', 'true')
ON CONFLICT (key) DO NOTHING;
