const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentHistory = sequelize.define('incident_history', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    incidentId: { type: DataTypes.INTEGER, allowNull: false },
    eventType:  { type: DataTypes.STRING(30), allowNull: false },
    fromValue:  { type: DataTypes.STRING(60), allowNull: true },
    toValue:    { type: DataTypes.STRING(60), allowNull: true },
    comment:    { type: DataTypes.TEXT,       allowNull: true },
    userId:     { type: DataTypes.INTEGER,    allowNull: true },
    personId:   { type: DataTypes.INTEGER,    allowNull: true },
    // true = comentario interno del staff: NO se ve en el portal del cliente.
    internal:   { type: DataTypes.BOOLEAN,    allowNull: false, defaultValue: false },
    changedAt:  { type: DataTypes.DATE }
}, { tableName: 'incident_history', timestamps: false });

const create = ({ incidentId, eventType, fromValue, toValue, comment, userId, personId, internal, transaction }) => {
    return IncidentHistory.create({
        incidentId,
        eventType,
        fromValue: fromValue || null,
        toValue:   toValue   || null,
        comment:   comment   || null,
        userId:    userId    || null,
        personId:  personId  || null,
        internal:  !!internal,
        changedAt: new Date()
    }, { transaction: transaction || null });
};

const getByIncidentId = (incidentId) => {
    const { User }   = require('./user');
    const { Person } = require('./person');
    return IncidentHistory.findAll({
        where: { incidentId },
        include: [
            { model: User,   as: 'user',   attributes: ['id', 'fullName'], required: false },
            { model: Person, as: 'person', required: false }
        ],
        order: [['changedAt', 'ASC']]
    });
};

module.exports = { IncidentHistory, create, getByIncidentId };
