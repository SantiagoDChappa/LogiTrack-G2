const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentPendingConfirmation = sequelize.define('incident_pending_confirmation', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    token:            { type: DataTypes.STRING(64),  allowNull: false, unique: true },
    shipmentId:       { type: DataTypes.INTEGER,     allowNull: false },
    incidentTypeId:   { type: DataTypes.INTEGER,     allowNull: false },
    description:      { type: DataTypes.TEXT,        allowNull: false },
    reporterName:     { type: DataTypes.STRING(120), allowNull: false },
    reporterEmail:    { type: DataTypes.STRING(160), allowNull: false },
    reporterDocument: { type: DataTypes.STRING(20),  allowNull: true },
    matchedPersonId:  { type: DataTypes.INTEGER,     allowNull: true },
    matchedRole:      { type: DataTypes.STRING(20),  allowNull: true },
    attachmentName:   { type: DataTypes.STRING(200), allowNull: true },
    attachmentMime:   { type: DataTypes.STRING(80),  allowNull: true },
    attachmentData:   { type: DataTypes.TEXT,        allowNull: true },
    expiresAt:        { type: DataTypes.DATE,        allowNull: false },
    createdAt:        { type: DataTypes.DATE }
}, { tableName: 'incident_pending_confirmation', timestamps: false });

const create = (data) => IncidentPendingConfirmation.create(data);

const findByToken = (token) => IncidentPendingConfirmation.findOne({ where: { token } });

const deleteByToken = (token) => IncidentPendingConfirmation.destroy({ where: { token } });

// Borrar expirados. Lo llamamos lazy desde el create para no necesitar cron.
const deleteExpired = () => IncidentPendingConfirmation.destroy({
    where: { expiresAt: { [Op.lt]: new Date() } }
});

module.exports = { IncidentPendingConfirmation, create, findByToken, deleteByToken, deleteExpired };
