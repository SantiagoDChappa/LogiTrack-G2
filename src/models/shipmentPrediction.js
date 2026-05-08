const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const ShipmentPrediction = sequelize.define('shipmentPrediction', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:        { type: DataTypes.INTEGER, allowNull: false },
    predictedDays:     { type: DataTypes.INTEGER, allowNull: false },
    delayProbability:  { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    delayed:           { type: DataTypes.BOOLEAN, allowNull: false },
    distanceKm:        { type: DataTypes.DECIMAL(8, 2) },
    createdAt:         { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    actualDays:        { type: DataTypes.INTEGER, defaultValue: null },
    wasDelayed:        { type: DataTypes.BOOLEAN, defaultValue: null },
}, { 
    timestamps: false, 
    tableName: 'shipmentPrediction' 
});

const savePrediction = async (data) => {
    return await ShipmentPrediction.create({
        shipmentId:       data.shipmentId,
        predictedDays:    data.predictedDays,
        delayProbability: data.delayProbability,
        delayed:          data.delayed,
        distanceKm:       data.distanceKm,
    });
};

const getByShipmentId = async (shipmentId) => {
    return await ShipmentPrediction.findAll({
        where: { shipmentId },
        order: [['createdAt', 'DESC']],
    });
};

const updateActualResult = async (shipmentId, actualDays, wasDelayed) => {
    return await ShipmentPrediction.update(
        { actualDays, wasDelayed },
        { where: { shipmentId } }
    );
};

module.exports = { ShipmentPrediction, savePrediction, getByShipmentId, updateActualResult };