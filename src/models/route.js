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
    startedAt:        { type: DataTypes.DATE, allowNull: true,  field: 'started_at' },
    finishedAt:       { type: DataTypes.DATE, allowNull: true,  field: 'finished_at' },
    totalPauseSeconds:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_pause_seconds' },
    fuelLPer100Km:    { type: DataTypes.DECIMAL(5, 2),  allowNull: false, defaultValue: 10,   field: 'fuel_l_per_100km' },
    fuelPricePerL:    { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1200, field: 'fuel_price_per_l' },
    // Sprint 3 - 2.4 Gestión ruteos con falla
    cancelReason:      { type: DataTypes.STRING(60),  allowNull: true, field: 'cancel_reason' },
    cancelDetail:      { type: DataTypes.TEXT,        allowNull: true, field: 'cancel_detail' },
    cancelledAt:       { type: DataTypes.DATE,        allowNull: true, field: 'cancelled_at' },
    cancelledByUserId: { type: DataTypes.INTEGER,     allowNull: true, field: 'cancelled_by_user_id' },
    interruptedAt:     { type: DataTypes.DATE,        allowNull: true, field: 'interrupted_at' },
    interruptReason:   { type: DataTypes.STRING(60),  allowNull: true, field: 'interrupt_reason' },
    returnedToBranch:  { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false, field: 'returned_to_branch' },
}, { tableName: 'route', timestamps: false });

const RouteStatus = Object.freeze({
    PLANNED:     1,
    IN_ROUTE:    2,
    FINISHED:    3,
    CANCELLED:   4,
    INTERRUPTED: 5, // Sprint 3 - ruta interrumpida (entregas vuelven a sucursal)
    BLOCKED_FATIGUE: 6, // Ojo de Patrón (LGT-193) - ruta bloqueada por fatiga del transportista
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

const getById = async (id) => {
    const { Transport } = require('./transport');
    const { User } = require('./user');
    const { Branch } = require('./branch');
    const { RouteStop } = require('./routeStop');
    const { Shipment } = require('./shipment');
    const { Address } = require('./address');
    const { Person } = require('./person');
    const { RoutePause } = require('./routePause');

    const route = await Route.findByPk(id, {
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
    if (!route) {return null;}
    const pauses = await RoutePause.findAll({ where: { routeId: route.id }, order: [['startedAt', 'ASC']] });
    route.dataValues.pauses = pauses.map(p => p.toJSON());
    return route;
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

const getAllByDriver = (driverUserId) => {
    const { Transport } = require('./transport');
    const { Branch } = require('./branch');
    const { RouteStop } = require('./routeStop');
    return Route.findAll({
        include: [
            { model: Transport, as: 'transport', where: { driverUserId }, required: true },
            { model: Branch,    as: 'originBranch' },
            { model: RouteStop, as: 'stops', required: false, attributes: ['id', 'completed', 'skipped', 'stopType', 'sequence'] },
        ],
        order: [['createdAt', 'DESC']],
    });
};

module.exports = { Route, RouteStatus, getAllByBranch, getById, getActiveByDriver, getAllByDriver };
