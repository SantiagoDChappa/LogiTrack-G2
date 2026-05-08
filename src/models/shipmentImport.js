const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const ShipmentImport = sequelize.define('shipment_import', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:         { type: DataTypes.INTEGER, allowNull: false },
    filename:       { type: DataTypes.STRING,  allowNull: true  },
    totalRows:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    importedCount:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorCount:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duplicateCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    forced:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    aborted:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt:      { type: DataTypes.DATE,    allowNull: false },
}, { tableName: 'shipment_import', timestamps: false });

const create = ({ userId, filename, totalRows, importedCount, errorCount, duplicateCount, forced, aborted }) => {
    return ShipmentImport.create({
        userId,
        filename:       filename || null,
        totalRows:      totalRows || 0,
        importedCount:  importedCount || 0,
        errorCount:     errorCount || 0,
        duplicateCount: duplicateCount || 0,
        forced:         Boolean(forced),
        aborted:        Boolean(aborted),
        createdAt:      new Date(),
    });
};

const getAll = ({ limit = 100 } = {}) => {
    const { User } = require('./user');
    return ShipmentImport.findAll({
        include: [{ model: User, as: 'user', attributes: ['id', 'fullName'] }],
        order: [['createdAt', 'DESC']],
        limit,
    });
};

module.exports = { ShipmentImport, create, getAll };
