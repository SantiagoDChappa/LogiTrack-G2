const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Incident = sequelize.define('incident', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:       { type: DataTypes.INTEGER, allowNull: false },
    incidentTypeId:   { type: DataTypes.INTEGER, allowNull: false },
    status:           { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'OPEN' },
    priority:         { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 2 },
    escalated:        { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
    resolution:       { type: DataTypes.STRING(20),  allowNull: true },
    description:      { type: DataTypes.TEXT,        allowNull: false },
    openedChannel:    { type: DataTypes.STRING(20),  allowNull: false },
    openedByUserId:   { type: DataTypes.INTEGER,     allowNull: true },
    openedByPersonId: { type: DataTypes.INTEGER,     allowNull: true },
    reporterName:     { type: DataTypes.STRING(120), allowNull: true },
    reporterEmail:    { type: DataTypes.STRING(160), allowNull: true },
    assignedToUserId: { type: DataTypes.INTEGER,     allowNull: true },
    closedByUserId:   { type: DataTypes.INTEGER,     allowNull: true },
    closedAt:         { type: DataTypes.DATE,        allowNull: true },
    createdAt:        { type: DataTypes.DATE },
    updatedAt:        { type: DataTypes.DATE }
}, { tableName: 'incident', timestamps: true });

const includesFull = () => {
    const { Shipment }     = require('./shipment');
    const { IncidentType } = require('./incidentType');
    const { User }         = require('./user');
    const { Person }       = require('./person');
    return [
        { model: Shipment,     as: 'shipment' },
        { model: IncidentType, as: 'type' },
        { model: User,         as: 'openedByUser',   attributes: ['id', 'fullName'], required: false },
        { model: Person,       as: 'openedByPerson', required: false },
        { model: User,         as: 'assignedTo',     attributes: ['id', 'fullName'], required: false },
        { model: User,         as: 'closedBy',       attributes: ['id', 'fullName'], required: false }
    ];
};

const findByIdFull = (id) => Incident.findOne({ where: { id }, include: includesFull() });

const list = ({ status, escalated, priority, assignedToUserId, shipmentId, openedByUserId, deliveryUserId, limit = 200 } = {}) => {
    const where = {};
    if (status)            { where.status = status; }
    if (typeof escalated === 'boolean') { where.escalated = escalated; }
    if (priority)          { where.priority = priority; }
    if (assignedToUserId)  { where.assignedToUserId = assignedToUserId; }
    if (shipmentId)        { where.shipmentId = shipmentId; }
    if (openedByUserId)    { where.openedByUserId = openedByUserId; }

    const { Shipment }     = require('./shipment');
    const { IncidentType } = require('./incidentType');
    const { User }         = require('./user');

    const shipmentInclude = { model: Shipment, as: 'shipment', attributes: ['id', 'trackingId', 'deliveryUserId'] };
    if (deliveryUserId) {
        shipmentInclude.where = { deliveryUserId };
        shipmentInclude.required = true;
    }

    return Incident.findAll({
        where,
        include: [
            shipmentInclude,
            { model: IncidentType, as: 'type', attributes: ['id', 'code', 'description'] },
            { model: User, as: 'assignedTo',   attributes: ['id', 'fullName'], required: false },
            { model: User, as: 'openedByUser', attributes: ['id', 'fullName'], required: false }
        ],
        order: [['escalated', 'DESC'], ['priority', 'DESC'], ['createdAt', 'DESC']],
        limit
    });
};

const countOpenByShipment = (shipmentId) => Incident.count({
    where: { shipmentId, status: ['OPEN', 'IN_REVIEW'] }
});

module.exports = { Incident, findByIdFull, list, countOpenByShipment };
