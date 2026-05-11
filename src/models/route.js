const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Route = sequelize.define('route', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    transportId:      { type: DataTypes.INTEGER, allowNull: false, field: 'transport_id' },
    originBranchId:   { type: DataTypes.INTEGER, allowNull: false, field: 'origin_branch_id' },
    statusId:         { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'status_id' },
    totalDistanceKm:  { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'total_distance_km' },
    totalCost:        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_cost' },
    totalWeightKg:    { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'total_weight_kg' },
    totalVolumeM3:    { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0, field: 'total_volume_m3' },
    createdAt:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, { tableName: 'route', timestamps: false });

const RouteStatus = Object.freeze({
    PLANNED:   1,
    IN_ROUTE:  2,
    FINISHED:  3,
    CANCELLED: 4,
});

const getAllByBranch = (branchId) => {
    const { Transport } = require('./transport');
    const { User } = require('./user');
    const { Branch } = require('./branch');
    return Route.findAll({
        where: branchId ? { originBranchId: branchId } : {},
        include: [
            { model: Transport, as: 'transport', include: [{ model: User, as: 'driver', required: false }] },
            { model: Branch,    as: 'originBranch' },
        ],
        order: [['createdAt', 'DESC']],
    });
};

const getById = (id) => {
    const { Transport } = require('./transport');
    const { User } = require('./user');
    const { Branch } = require('./branch');
    const { RouteStop } = require('./routeStop');
    const { Shipment } = require('./shipment');
    const { Address } = require('./address');
    const { Person } = require('./person');
    return Route.findByPk(id, {
        include: [
            { model: Transport, as: 'transport', include: [{ model: User, as: 'driver', required: false }] },
            { model: Branch,    as: 'originBranch' },
            {
                model: RouteStop, as: 'stops',
                include: [
                    { model: Branch,   as: 'branch',   required: false },
                    {
                        model: Shipment, as: 'shipment', required: false,
                        include: [
                            { model: Address, as: 'address', required: false },
                            { model: Person,  as: 'recipient', required: false },
                        ],
                    },
                ],
            },
        ],
        order: [[{ model: require('./routeStop').RouteStop, as: 'stops' }, 'sequence', 'ASC']],
    });
};

const getActiveByDriver = (driverUserId) => {
    const { Transport } = require('./transport');
    return Route.findOne({
        where: { statusId: { [require('sequelize').Op.in]: [RouteStatus.PLANNED, RouteStatus.IN_ROUTE] } },
        include: [
            { model: Transport, as: 'transport', where: { driverUserId }, required: true },
        ],
        order: [['createdAt', 'DESC']],
    });
};

module.exports = { Route, RouteStatus, getAllByBranch, getById, getActiveByDriver };
