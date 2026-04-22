const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { Status } = require('./status');

const ShipmentHistory = sequelize.define('shipment_history', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:   { type: DataTypes.INTEGER },
    fromStatusId: { type: DataTypes.INTEGER, allowNull: true },
    toStatusId:   { type: DataTypes.INTEGER },
    comment:      { type: DataTypes.TEXT,    allowNull: true },
    changedAt:    { type: DataTypes.DATE }
}, { tableName: 'shipment_history', timestamps: false });

ShipmentHistory.belongsTo(Status, { as: 'fromStatus', foreignKey: 'fromStatusId' });
ShipmentHistory.belongsTo(Status, { as: 'toStatus',   foreignKey: 'toStatusId'   });

const create = async ({ shipmentId, fromStatusId, toStatusId, comment }) => {
    return await ShipmentHistory.create({
        shipmentId,
        fromStatusId: fromStatusId || null,
        toStatusId,
        comment:      comment || null,
        changedAt:    new Date()
    });
};

const getByShipmentId = async (shipmentId) => {
    return await ShipmentHistory.findAll({
        where: { shipmentId },
        include: [
            { model: Status, as: 'fromStatus' },
            { model: Status, as: 'toStatus'   }
        ],
        order: [['changedAt', 'DESC']]
    });
};

module.exports = { ShipmentHistory, create, getByShipmentId };
