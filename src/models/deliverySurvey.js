const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const DeliverySurvey = sequelize.define('delivery_survey', {
    id:                     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:             { type: DataTypes.INTEGER, allowNull: false },
    overallRating:          { type: DataTypes.SMALLINT, allowNull: false },
    punctualityRating:      { type: DataTypes.SMALLINT, allowNull: false },
    packageConditionRating: { type: DataTypes.SMALLINT, allowNull: false },
    serviceRating:          { type: DataTypes.SMALLINT, allowNull: false },
    comment:                { type: DataTypes.TEXT, allowNull: true },
    respondedByDocument:    { type: DataTypes.INTEGER, allowNull: true },
    respondedByEmail:       { type: DataTypes.STRING(255), allowNull: true },
    createdAt:              { type: DataTypes.DATE },
}, { tableName: 'delivery_survey', timestamps: false });

const create = (data) => DeliverySurvey.create(data);

const findByShipmentId = (shipmentId) =>
    DeliverySurvey.findOne({ where: { shipmentId } });

const findByShipmentIds = (shipmentIds) => {
    const ids = Array.isArray(shipmentIds) ? shipmentIds.filter(Boolean) : [];
    if (!ids.length) return Promise.resolve([]);
    return DeliverySurvey.findAll({ where: { shipmentId: { [Op.in]: ids } } });
};

const getAll = ({ limit = 200, offset = 0 } = {}) =>
    DeliverySurvey.findAll({ order: [['createdAt', 'DESC']], limit, offset });

module.exports = { DeliverySurvey, create, findByShipmentId, findByShipmentIds, getAll };
