const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const ShipmentPrediction = sequelize.define('shipmentPrediction', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:       { type: DataTypes.INTEGER, allowNull: false },
    predictedDays:    { type: DataTypes.INTEGER },
    delayProbability: { type: DataTypes.DECIMAL(5, 2) },
    delayed:          { type: DataTypes.BOOLEAN },
    distanceKm:       { type: DataTypes.DECIMAL(10, 2) },
    createdAt:        { type: DataTypes.DATE },
    actualDays:       { type: DataTypes.INTEGER, allowNull: true },
    wasDelayed:       { type: DataTypes.BOOLEAN, allowNull: true },
}, { tableName: 'shipmentPrediction', timestamps: false });

// Devuelve Map<shipmentId, latestPredictionRow>
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

module.exports = { ShipmentPrediction, getLatestByShipmentIds, Op };
