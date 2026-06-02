const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentAttachment = sequelize.define('incident_attachment', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    incidentId:         { type: DataTypes.INTEGER,     allowNull: false },
    fileName:           { type: DataTypes.STRING(200), allowNull: false },
    mimeType:           { type: DataTypes.STRING(80),  allowNull: false },
    dataBase64:         { type: DataTypes.TEXT,        allowNull: false },
    source:             { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'INTERNAL' },
    uploadedByUserId:   { type: DataTypes.INTEGER,     allowNull: true },
    uploadedByPersonId: { type: DataTypes.INTEGER,     allowNull: true },
    createdAt:          { type: DataTypes.DATE }
}, { tableName: 'incident_attachment', timestamps: false });

// Listado liviano (sin el payload base64) para render del detalle.
const getMetaByIncidentId = (incidentId, options = {}) => IncidentAttachment.findAll({
    where: { incidentId },
    attributes: ['id', 'incidentId', 'fileName', 'mimeType', 'source', 'uploadedByUserId', 'uploadedByPersonId', 'createdAt'],
    order: [['createdAt', 'ASC']],
    transaction: options.transaction || null
});

const getById = (id) => IncidentAttachment.findOne({ where: { id } });

module.exports = { IncidentAttachment, getMetaByIncidentId, getById };
