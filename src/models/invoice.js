const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Factura del envío (comprobante al remitente). Se genera al dar de alta el envío
// con el desglose de costo persistido. Una factura por envío.
const Invoice = sequelize.define('Invoice', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    number:          { type: DataTypes.STRING(30), allowNull: false },
    shipmentId:      { type: DataTypes.INTEGER, allowNull: false },
    amount:          { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    costBase:        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    zoneBase:        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    weightSurcharge: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    volumeSurcharge: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    // [prototype] Seguro de mercadería itemizado (parte del subtotal/total).
    insuranceAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'insuranceAmount' },
    // [prototype] Recargo por distancia + Express/Frágil, itemizados (parte del subtotal/total).
    distanceKm:        { type: DataTypes.DECIMAL(10, 2), allowNull: true,  field: 'distanceKm' },
    distanceSurcharge: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'distanceSurcharge' },
    expressSurcharge:  { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'expressSurcharge' },
    fragileSurcharge:  { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'fragileSurcharge' },
    subtotal:        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    senderName:      { type: DataTypes.STRING(120) },
    senderDocument:  { type: DataTypes.STRING(30) },
    createdByUserId: { type: DataTypes.INTEGER },
    createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // [prototype] Pago simulado: estado del cobro + link público al checkout.
    payStatus:       { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDIENTE', field: 'payStatus' },
    payMethod:       { type: DataTypes.STRING(20), allowNull: true,  field: 'payMethod' },
    payRef:          { type: DataTypes.STRING(40), allowNull: true,  field: 'payRef' },
    paidAt:          { type: DataTypes.DATE,       allowNull: true,  field: 'paidAt' },
    payToken:        { type: DataTypes.STRING(60), allowNull: true,  field: 'payToken' },
    // [prototype] Pago real con Mercado Pago: ids para correlacionar el webhook.
    mpPreferenceId:  { type: DataTypes.STRING(80), allowNull: true,  field: 'mpPreferenceId' },
    mpPaymentId:     { type: DataTypes.STRING(80), allowNull: true,  field: 'mpPaymentId' },
    // [prototype] Anulada por una nota de crédito que cubrió el total del envío.
    voidedByCreditNoteId: { type: DataTypes.INTEGER, allowNull: true, field: 'voidedByCreditNoteId' },
}, {
    tableName: 'invoice',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { Invoice };
