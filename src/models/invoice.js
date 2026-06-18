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
    subtotal:        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    senderName:      { type: DataTypes.STRING(120) },
    senderDocument:  { type: DataTypes.STRING(30) },
    createdByUserId: { type: DataTypes.INTEGER },
    createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'invoice',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { Invoice };
