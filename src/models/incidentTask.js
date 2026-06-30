const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentTask = sequelize.define('incident_task', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    incidentId:   { type: DataTypes.INTEGER,     allowNull: false },
    templateId:   { type: DataTypes.INTEGER,     allowNull: true },
    description:  { type: DataTypes.STRING(200), allowNull: false },
    required:     { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
    done:         { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
    doneByUserId: { type: DataTypes.INTEGER,     allowNull: true },
    doneAt:       { type: DataTypes.DATE,        allowNull: true },
    ordering:     { type: DataTypes.SMALLINT,    allowNull: false, defaultValue: 0 }
}, { tableName: 'incident_task', timestamps: false });

const getByIncidentId = (incidentId, options = {}) => {
    const { User } = require('./user');
    return IncidentTask.findAll({
        where: { incidentId },
        include: [{ model: User, as: 'doneBy', attributes: ['id', 'fullName'], required: false }],
        order: [['ordering', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction || null
    });
};

const countPendingRequired = (incidentId, options = {}) => IncidentTask.count({
    where: { incidentId, required: true, done: false },
    transaction: options.transaction || null
});

module.exports = { IncidentTask, getByIncidentId, countPendingRequired };
