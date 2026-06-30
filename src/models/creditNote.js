const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// LGT-214 — nota de crédito por reembolso (vinculada al envío + incidencia o devolución).
const CreditNote = sequelize.define('CreditNote', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    number:          { type: DataTypes.STRING(30), allowNull: false },
    shipmentId:      { type: DataTypes.INTEGER, allowNull: false },
    incidentId:      { type: DataTypes.INTEGER },
    returnId:        { type: DataTypes.INTEGER },
    amount:          { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    // Datos fiscales del remitente (la NC de reembolso se emite al remitente).
    senderName:      { type: DataTypes.STRING(120) },
    senderDocument:  { type: DataTypes.STRING(30) },
    // [prototype] Importe de seguro itemizado (parte del total `amount`).
    insuranceAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'insuranceAmount' },
    // [prototype] Recargo por distancia + Express/Frágil itemizados (parte del total `amount`).
    distanceKm:        { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'distanceKm' },
    distanceSurcharge: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'distanceSurcharge' },
    expressSurcharge:  { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'expressSurcharge' },
    fragileSurcharge:  { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'fragileSurcharge' },
    createdByUserId: { type: DataTypes.INTEGER },
    createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'credit_note',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { CreditNote };
