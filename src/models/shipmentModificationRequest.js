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

/** Búsqueda universal — tracking, DNI/email del solicitante, destinatario o id. */
const searchForUniversal = ({ q, branchId, fetchLimit }) => {
    const { Shipment } = require('./shipment');
    const { Person } = require('./person');
    const trimmed = String(q).trim();
    const like = { [Op.iLike]: `%${trimmed}%` };
    const numeric = /^\d{1,9}$/.test(trimmed);
    const shipmentWhere = branchId ? { currentBranchId: branchId } : {};

    const orClauses = [
        { '$shipment.trackingId$': like },
        { requestedByEmail: like },
        { '$shipment.recipient.fullName$': like },
    ];
    if (numeric) {
        orClauses.push({ id: parseInt(trimmed, 10) });
        orClauses.push({ requestedByDocument: parseInt(trimmed, 10) });
    }

    return ShipmentModificationRequest.findAll({
        where: { [Op.or]: orClauses },
        include: [{
            model: Shipment,
            as: 'shipment',
            required: true,
            where: Object.keys(shipmentWhere).length ? shipmentWhere : undefined,
            attributes: ['id', 'trackingId'],
            include: [{ model: Person, as: 'recipient', attributes: ['fullName'] }],
        }],
        attributes: ['id', 'shipmentId', 'changeType', 'status', 'requestedByEmail', 'requestedByDocument'],
        order: [['id', 'DESC']],
        limit: fetchLimit,
        subQuery: false,
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
    searchForUniversal,
    updateById,
};
