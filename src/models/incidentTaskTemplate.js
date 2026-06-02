const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentTaskTemplate = sequelize.define('incident_task_template', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    incidentTypeId: { type: DataTypes.INTEGER,     allowNull: false },
    description:    { type: DataTypes.STRING(200), allowNull: false },
    ordering:       { type: DataTypes.SMALLINT,    allowNull: false, defaultValue: 0 },
    required:       { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
    active:         { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true }
}, { tableName: 'incident_task_template', timestamps: false });

const getActiveByType = (incidentTypeId, options = {}) => IncidentTaskTemplate.findAll({
    where: { incidentTypeId, active: true },
    order: [['ordering', 'ASC'], ['id', 'ASC']],
    transaction: options.transaction || null
});

const getAllByType = (incidentTypeId) => IncidentTaskTemplate.findAll({
    where: { incidentTypeId },
    order: [['ordering', 'ASC'], ['id', 'ASC']]
});

const getById = (id) => IncidentTaskTemplate.findOne({ where: { id } });

module.exports = { IncidentTaskTemplate, getActiveByType, getAllByType, getById };
