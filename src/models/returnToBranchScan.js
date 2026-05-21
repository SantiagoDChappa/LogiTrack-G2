const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const ReturnToBranchScan = sequelize.define('return_to_branch_scan', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId: { type: DataTypes.INTEGER, allowNull: false, field: 'shipment_id' },
    branchId:   { type: DataTypes.INTEGER, allowNull: false, field: 'branch_id' },
    userId:     { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    routeId:    { type: DataTypes.INTEGER, allowNull: true,  field: 'route_id' },
    scannedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'scanned_at' },
}, { tableName: 'return_to_branch_scan', timestamps: false });

module.exports = { ReturnToBranchScan };
