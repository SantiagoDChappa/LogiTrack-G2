const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentSurvey = sequelize.define('incident_survey', {
    id:                   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    incidentId:           { type: DataTypes.INTEGER, allowNull: false },
    overallRating:        { type: DataTypes.SMALLINT, allowNull: false },
    resolutionTimeRating: { type: DataTypes.SMALLINT, allowNull: false },
    communicationRating:  { type: DataTypes.SMALLINT, allowNull: false },
    outcomeRating:        { type: DataTypes.SMALLINT, allowNull: false },
    comment:              { type: DataTypes.TEXT, allowNull: true },
    respondedByDocument:  { type: DataTypes.INTEGER, allowNull: false },
    respondedByEmail:     { type: DataTypes.STRING(255), allowNull: false },
    createdAt:            { type: DataTypes.DATE },
}, { tableName: 'incident_survey', timestamps: false });

const create = (data) => IncidentSurvey.create(data);

const findByIncidentId = (incidentId) =>
    IncidentSurvey.findOne({ where: { incidentId } });

const findByIncidentIds = (incidentIds) => {
    const ids = Array.isArray(incidentIds) ? incidentIds.filter(Boolean) : [];
    if (!ids.length) return Promise.resolve([]);
    return IncidentSurvey.findAll({ where: { incidentId: { [Op.in]: ids } } });
};

const getAll = ({ limit = 200, offset = 0 } = {}) =>
    IncidentSurvey.findAll({ order: [['createdAt', 'DESC']], limit, offset });

module.exports = { IncidentSurvey, create, findByIncidentId, findByIncidentIds, getAll };
