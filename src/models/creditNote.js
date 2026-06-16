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
    createdByUserId: { type: DataTypes.INTEGER },
    createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'credit_note',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { CreditNote };
