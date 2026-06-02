const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');
const { ModificationRequestStatus } = require('../constants/enums');

const ShipmentModificationRequest = sequelize.define('shipment_modification_request', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:          { type: DataTypes.INTEGER, allowNull: false },
    changeType:          { type: DataTypes.STRING(40), allowNull: false },
    payload:             { type: DataTypes.JSONB, allowNull: false },
    status:              { type: DataTypes.STRING(20), allowNull: false },
    channel:             { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PORTAL' },
    requestedByDocument: { type: DataTypes.INTEGER, allowNull: true },
    requestedByEmail:    { type: DataTypes.STRING(160), allowNull: true },
    reviewedByUserId:    { type: DataTypes.INTEGER, allowNull: true },
    reviewedAt:          { type: DataTypes.DATE, allowNull: true },
    reviewComment:       { type: DataTypes.TEXT, allowNull: true },
    createdAt:           { type: DataTypes.DATE },
}, { tableName: 'shipment_modification_request', timestamps: false });

const create = (data, options = {}) => ShipmentModificationRequest.create(data, options);

const findById = (id) => {
    const { Shipment } = require('./shipment');
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { User } = require('./user');

    return ShipmentModificationRequest.findOne({
        where: { id },
        include: [{
            model: Shipment,
            as: 'shipment',
            include: [
                { model: Person, as: 'recipient', attributes: ['fullName'] },
                { model: Status, as: 'status', attributes: ['description'] },
            ],
        }, {
            model: User,
            as: 'reviewedBy',
            attributes: ['fullName'],
            required: false,
        }],
    });
};

const listByShipmentId = (shipmentId) => ShipmentModificationRequest.findAll({
    where: { shipmentId },
    order: [['createdAt', 'DESC']],
});

const listPending = ({ branchId, status, includeAll = false } = {}) => {
    const { Shipment } = require('./shipment');
    const { Person } = require('./person');
    const { Status } = require('./status');

    const where = includeAll ? {} : { status: status || ModificationRequestStatus.PENDING_REVIEW };
    const shipmentWhere = branchId ? { currentBranchId: branchId } : {};

    return ShipmentModificationRequest.findAll({
        where,
        include: [{
            model: Shipment,
            as: 'shipment',
            where: Object.keys(shipmentWhere).length ? shipmentWhere : undefined,
            required: true,
            include: [
                { model: Person, as: 'recipient', attributes: ['fullName'] },
                { model: Status, as: 'status', attributes: ['description'] },
            ],
        }],
        order: [['createdAt', 'ASC']],
    });
};

const updateById = (id, data, options = {}) => ShipmentModificationRequest.update(data, {
    where: { id },
    ...options,
});

module.exports = {
    ShipmentModificationRequest,
    create,
    findById,
    listByShipmentId,
    listPending,
    updateById,
};
