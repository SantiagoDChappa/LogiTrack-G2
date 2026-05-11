const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const ShipmentPrediction = sequelize.define('shipmentPrediction', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:       { type: DataTypes.INTEGER, allowNull: false },
    predictedDays:    { type: DataTypes.INTEGER, allowNull: false },
    delayProbability: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    delayed:          { type: DataTypes.BOOLEAN, allowNull: false },
    distanceKm:       { type: DataTypes.DECIMAL(10, 2) },
    createdAt:        { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    actualDays:       { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    wasDelayed:       { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
}, { tableName: 'shipmentPrediction', timestamps: false });

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

const getLatestByShipmentIds = async (shipmentIds) => {
    if (!shipmentIds?.length) { return new Map(); }
    const ids = shipmentIds.map(Number).filter(Boolean);
    if (ids.length === 0) { return new Map(); }
    const rows = await sequelize.query(
        `SELECT DISTINCT ON ("shipmentId") "shipmentId", "predictedDays", "delayProbability", delayed, "distanceKm", "createdAt"
           FROM logitrack."shipmentPrediction"
          WHERE "shipmentId" IN (:ids)
          ORDER BY "shipmentId", "createdAt" DESC`,
        { replacements: { ids }, type: sequelize.QueryTypes.SELECT }
    );
    const map = new Map();
    for (const r of rows) { map.set(Number(r.shipmentId), r); }
    return map;
};

module.exports = { ShipmentPrediction, savePrediction, getByShipmentId, updateActualResult, getLatestByShipmentIds, Op };
