const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const PaymentWebhookEvent = sequelize.define('paymentWebhookEvent', {
    mpPaymentId: { type: DataTypes.STRING(80), primaryKey: true, field: 'mp_payment_id' },
    receivedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'received_at' },
}, { tableName: 'payment_webhook_event', schema: 'logitrack', timestamps: false });

// Idempotencia: si ya se procesó ese mp_payment_id, el insert no entra (PK duplicada)
// y devolvemos false para que el webhook lo ignore sin volver a aplicar el pago.
const recordIfNew = async (mpPaymentId) => {
    try {
        await PaymentWebhookEvent.create({ mpPaymentId });
        return true;
    } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') { return false; }
        throw e;
    }
};

module.exports = { PaymentWebhookEvent, recordIfNew };
