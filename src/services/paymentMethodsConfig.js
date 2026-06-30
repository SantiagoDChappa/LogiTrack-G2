// Configuración de cobros (Ajustes → Configuración de cobros): qué medios de
// pago están habilitados + datos bancarios de referencia para el operador.
const settingModel = require('../models/setting');

const get = async () => {
    const settings = await settingModel.getAll();
    return {
        mercadopagoEnabled:   settings.medio_pago_mercadopago_habilitado   !== 'false',
        efectivoEnabled:      settings.medio_pago_efectivo_habilitado      !== 'false',
        transferenciaEnabled: settings.medio_pago_transferencia_habilitado !== 'false',
        cbu:     settings.cbu_empresa     || '',
        alias:   settings.alias_empresa   || '',
        titular: settings.titular_empresa || '',
        banco:   settings.banco_empresa   || '',
    };
};

module.exports = { get };
