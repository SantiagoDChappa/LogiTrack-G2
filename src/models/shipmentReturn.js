const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// LGT-182 — Devolución de un envío (dominio greenfield).
const ShipmentReturn = sequelize.define('ShipmentReturn', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:       { type: DataTypes.INTEGER, allowNull: false },
    status:           { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'SOLICITADA' },
    reason:           { type: DataTypes.STRING(30), allowNull: false },
    reasonOther:      { type: DataTypes.TEXT },
    observations:     { type: DataTypes.TEXT },
    deliveryMode:     { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'home' },
    pickupBranchId:   { type: DataTypes.INTEGER },
    result:           { type: DataTypes.STRING(20) },
    rejectionReason:  { type: DataTypes.TEXT },
    reviewedByUserId: { type: DataTypes.INTEGER },
    createdByDocument: { type: DataTypes.STRING(30) },
    createdAt:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'shipment_return',
    schema: 'logitrack',
    timestamps: false,
});

// Historial de cambios de estado / acciones sobre la devolución.
const ShipmentReturnHistory = sequelize.define('ShipmentReturnHistory', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    returnId:   { type: DataTypes.INTEGER, allowNull: false },
    fromStatus: { type: DataTypes.STRING(20) },
    toStatus:   { type: DataTypes.STRING(20) },
    comment:    { type: DataTypes.TEXT },
    byUserId:   { type: DataTypes.INTEGER },
    byClient:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'shipment_return_history',
    schema: 'logitrack',
    timestamps: false,
});

module.exports = { ShipmentReturn, ShipmentReturnHistory };
