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
        { model: User,         as: 'assignedTo',     attributes: ['id', 'fullName', 'branchId'], required: false },
        { model: User,         as: 'closedBy',       attributes: ['id', 'fullName'], required: false }
    ];
};

const findByIdFull = (id) => Incident.findOne({ where: { id }, include: includesFull() });

const list = ({ id, status, escalated, priority, assignedToUserId, shipmentId, openedByUserId, deliveryUserId, branchId, staffScope, openedChannel, resolution, limit = 200 } = {}) => {
    const { Op } = require('sequelize');
    const where = {};
    if (id)                { where.id = id; }
    if (status)            { where.status = status; }
    if (typeof escalated === 'boolean') { where.escalated = escalated; }
    if (priority)          { where.priority = priority; }
    if (assignedToUserId)  { where.assignedToUserId = assignedToUserId; }
    if (shipmentId)        { where.shipmentId = shipmentId; }
    if (openedByUserId)    { where.openedByUserId = openedByUserId; }
    if (openedChannel)     { where.openedChannel = openedChannel; }
    if (resolution)        { where.resolution = resolution; }

    const { Shipment }     = require('./shipment');
    const { IncidentType } = require('./incidentType');
    const { User }         = require('./user');

    const shipmentInclude = { model: Shipment, as: 'shipment', attributes: ['id', 'trackingId', 'deliveryUserId', 'currentBranchId'] };
    const shipmentWhere = {};
    if (deliveryUserId) { shipmentWhere.deliveryUserId = deliveryUserId; }
    if (branchId)       { shipmentWhere.currentBranchId = branchId; }
    if (Object.keys(shipmentWhere).length > 0) {
        shipmentInclude.where = shipmentWhere;
        shipmentInclude.required = true;
    }

    // RBAC supervisor/operador: visible si el envio esta en su sucursal,
    // si la incidencia esta asignada a alguien de su sucursal, o asignada al usuario.
    if (staffScope) {
        const orClauses = [];
        if (staffScope.branchId) {
            orClauses.push({ '$shipment.currentBranchId$': staffScope.branchId });
            orClauses.push({ '$assignedTo.branchId$':      staffScope.branchId });
        }
        if (staffScope.userId) {
            orClauses.push({ assignedToUserId: staffScope.userId });
            orClauses.push({ openedByUserId:   staffScope.userId });
        }
        if (orClauses.length > 0) {
            where[Op.and] = [...(where[Op.and] || []), { [Op.or]: orClauses }];
        } else {
            // staff sin sucursal y sin id: no ve nada
            where.id = -1;
        }
    }

    return Incident.findAll({
        where,
        include: [
            shipmentInclude,
            { model: IncidentType, as: 'type', attributes: ['id', 'code', 'description'] },
            { model: User, as: 'assignedTo',   attributes: ['id', 'fullName', 'branchId'], required: false },
            { model: User, as: 'openedByUser', attributes: ['id', 'fullName'], required: false }
        ],
        order: [['escalated', 'DESC'], ['priority', 'DESC'], ['createdAt', 'DESC']],
        limit,
        subQuery: false
    });
};

const countOpenByShipment = (shipmentId) => Incident.count({
    where: { shipmentId, status: ['OPEN', 'IN_REVIEW'] }
});

const findOpenByShipment = (shipmentId) => Incident.findAll({
    where: { shipmentId, status: ['OPEN', 'IN_REVIEW'] },
    attributes: ['id', 'incidentTypeId', 'status']
});

const findByShipmentIds = (shipmentIds, { statusIn, limit = 200 } = {}) => {
    const { Op } = require('sequelize');
    const ids = Array.isArray(shipmentIds) ? shipmentIds.filter(Boolean) : [];
    if (!ids.length) { return Promise.resolve([]); }

    const where = { shipmentId: { [Op.in]: ids } };
    if (statusIn?.length) { where.status = { [Op.in]: statusIn }; }

    const { Shipment } = require('./shipment');
    const { IncidentType } = require('./incidentType');

    return Incident.findAll({
        where,
        include: [
            { model: Shipment, as: 'shipment', attributes: ['id', 'trackingId'], required: true },
            { model: IncidentType, as: 'type', attributes: ['id', 'code', 'description'], required: true },
        ],
        attributes: ['id', 'shipmentId', 'status', 'resolution', 'description', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit,
    });
};

module.exports = { Incident, findByIdFull, list, countOpenByShipment, findOpenByShipment, findByShipmentIds };
