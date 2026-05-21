const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Transport = sequelize.define('transport', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:          { type: DataTypes.STRING(150), allowNull: false },
    plate:         { type: DataTypes.STRING(20),  allowNull: true },
    maxWeightKg:   { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'max_weight_kg' },
    maxVolumeM3:   { type: DataTypes.DECIMAL(10, 3), allowNull: false, field: 'max_volume_m3' },
    fixedCost:     { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'fixed_cost' },
    costPerKm:     { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'cost_per_km' },
    autonomyKm:    { type: DataTypes.INTEGER, allowNull: true, field: 'autonomy_km' },
    driverUserId:  { type: DataTypes.INTEGER, allowNull: true, field: 'driver_user_id' },
    branchId:      { type: DataTypes.INTEGER, allowNull: true, field: 'branch_id' },
    enabled:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    commissionPerDelivery: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0,  field: 'commission_per_delivery' },
    fuelLPer100Km:         { type: DataTypes.DECIMAL(5, 2),  allowNull: false, defaultValue: 10, field: 'fuel_l_per_100km' },
}, { tableName: 'transport', timestamps: false });

const getAll = () => {
    const { User } = require('./user');
    const { Branch } = require('./branch');
    return Transport.findAll({
        include: [
            { model: User,   as: 'driver', required: false },
            { model: Branch, as: 'branch', required: false },
        ],
        order: [['name', 'ASC']],
    });
};

const getById = (id) => {
    const { User } = require('./user');
    const { Branch } = require('./branch');
    const { Zone } = require('./zone');
    return Transport.findByPk(id, {
        include: [
            { model: User,   as: 'driver', required: false },
            { model: Branch, as: 'branch', required: false },
            { model: Zone,   as: 'zones',  required: false, through: { attributes: [] } },
        ],
    });
};

const getEnabledForBranch = (branchId) => {
    const { User } = require('./user');
    const { Zone } = require('./zone');
    const where = { enabled: true };
    if (branchId) { where.branchId = branchId; }
    return Transport.findAll({
        where,
        include: [
            { model: User, as: 'driver', required: false },
            { model: Zone, as: 'zones',  required: false, through: { attributes: [] } },
        ],
        order: [['name', 'ASC']],
    });
};

module.exports = { Transport, getAll, getById, getEnabledForBranch };
