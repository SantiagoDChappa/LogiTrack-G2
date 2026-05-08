const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const Shipment = sequelize.define('shipment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    trackingId:       { type: DataTypes.STRING },
    statusId:         { type: DataTypes.INTEGER },
    createdAt:        { type: DataTypes.DATE },
    senderId:         { type: DataTypes.INTEGER },
    recipientId:      { type: DataTypes.INTEGER },
    addressId:        { type: DataTypes.INTEGER },
    shipmentTypeId:   { type: DataTypes.INTEGER },
    weightKg:         { type: DataTypes.DECIMAL(8, 2) },
    packageQty:       { type: DataTypes.INTEGER },
    volumeM3:         { type: DataTypes.DECIMAL(8, 3) },
    deliveryUserId:   { type: DataTypes.INTEGER },
    legacyTrackingId: { type: DataTypes.STRING },
},
{ timestamps: true, tableName: 'shipment' });

const getAll = () => {
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { Address } = require('./address');
    const { Province } = require('./province');
    const { TypeShipment } = require('./typeShipment');
    const { User } = require('./user');
    
    return Shipment.findAll({ 
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false }
        ] 
    });
};

const getById = (id) => {
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { Address } = require('./address');
    const { Province } = require('./province');
    const { TypeShipment } = require('./typeShipment');
    const { User } = require('./user');

    return Shipment.findOne({
        where: { id },
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false }
        ]
    });
};

const generateTrackingId = async () => {
    const last = await Shipment.findOne({ order: [['id', 'DESC']] });
    const next = last ? last.id + 1 : 1;
    return `ENV-${String(next).padStart(3, '0')}`;
};

const create = async (data) => {
    const trackingId = await generateTrackingId();
    return Shipment.create({
        trackingId,
        statusId:         data.statusId || 1,
        senderId:         data.senderId,
        recipientId:      data.recipientId,
        addressId:        data.addressId,
        shipmentTypeId:   data.shipmentTypeId || null,
        weightKg:         data.weightKg       || null,
        packageQty:       data.packageQty      || null,
        volumeM3:         data.volumeM3 || null,
        legacyTrackingId: data.legacyTrackingId || null,
        createdAt:        new Date().toISOString().split('T')[0]
    });
};

const findByLegacyTrackingId = (legacyTrackingId) => {
    if (!legacyTrackingId) { return Promise.resolve(null); }
    return Shipment.findOne({ where: { legacyTrackingId } });
};

const findPotentialDuplicate = ({ senderDocument, recipientDocument, street, number, provinceId, statusId }) => {
    const { Person } = require('./person');
    const { Address } = require('./address');

    return Shipment.findOne({
        where: { statusId },
        include: [
            { model: Person,  as: 'sender',    where: { document: senderDocument },    required: true },
            { model: Person,  as: 'recipient', where: { document: recipientDocument }, required: true },
            { model: Address, as: 'address',   where: { street, number, provinceId },  required: true },
        ]
    });
};

const search = ({ trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds, deliveryUserId }) => {
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { Address } = require('./address');
    
    const shipmentWhere  = {};
    const senderWhere    = {};
    const recipientWhere = {};

    if (deliveryUserId) { shipmentWhere.deliveryUserId = deliveryUserId; }

    if (statusIds && statusIds.length > 0) {
        shipmentWhere.statusId = { [Op.in]: statusIds.map(Number) };
    }

    if (trackingId) { shipmentWhere.trackingId = { [Op.iLike]: `%${trackingId}%` }; }

    const isBoth      = !role || role === 'both';
    const isSender    = role === 'sender';
    const isRecipient = role === 'recipient';

    if (isBoth) {
        if (senderName)        { senderWhere.fullName    = { [Op.iLike]: `%${senderName}%` }; }
        if (senderDocument)    { senderWhere.document    = senderDocument; }
        if (recipientName)     { recipientWhere.fullName = { [Op.iLike]: `%${recipientName}%` }; }
        if (recipientDocument) { recipientWhere.document = recipientDocument; }
    } else if (isSender) {
        if (name)     { senderWhere.fullName = { [Op.iLike]: `%${name}%` }; }
        if (document) { senderWhere.document = document; }
    } else if (isRecipient) {
        if (name)     { recipientWhere.fullName = { [Op.iLike]: `%${name}%` }; }
        if (document) { recipientWhere.document = document; }
    }

    return Shipment.findAll({
        where: shipmentWhere,
        include: [
            {
                model:    Person,
                as:       'sender',
                where:    Object.keys(senderWhere).length    ? senderWhere    : undefined,
                required: Object.keys(senderWhere).length    ? true           : false,
            },
            {
                model:    Person,
                as:       'recipient',
                where:    Object.keys(recipientWhere).length ? recipientWhere : undefined,
                required: Object.keys(recipientWhere).length ? true           : false,
            },
            { model: Status,  as: 'status'  },
            { model: Address, as: 'address' },
        ]
    });
};

const update = async (data) => {
    const { Status } = require('./status');
    const { Person } = require('./person');
    const { Address } = require('./address');
    
    const shipment = await Shipment.findOne({ 
        where: { id: data.id },
        include: [{ model: Status, as: 'status' }]
    });
    if (!shipment) { return null; }

    const statusId = shipment.statusId;

    if (statusId === 4 || statusId === 5 || statusId === 3) {
        if (data.deliveryUserId !== undefined) {
             await Shipment.update(
                { deliveryUserId: data.deliveryUserId || null },
                { where: { id: data.id } }
            );
        }
        return shipment;
    }

    if (statusId === 2) { // En Tránsito
        await Person.update(
            { phone: data.recipientPhone, email: data.recipientEmail },
            { where: { id: shipment.recipientId } }
        );
        
        if (data.deliveryUserId !== undefined) {
            await Shipment.update(
               { deliveryUserId: data.deliveryUserId || null },
               { where: { id: data.id } }
           );
        }
        return shipment;
    }

    if (statusId === 1) { // Pendiente
        await Person.update(
            { fullName: data.recipientName, document: data.recipientDocument, phone: data.recipientPhone, email: data.recipientEmail },
            { where: { id: shipment.recipientId } }
        );

        await Address.update(
            { 
                street: data.street, 
                number: data.number, 
                provinceId: data.province, 
                postalCode: data.postalCode, 
                floorApartment: data.floorApartment, 
                lat: data.addressLat || null, 
                lng: data.addressLng || null 
            },
            { where: { id: shipment.addressId } }
        );

        await Shipment.update(
            {
                deliveryUserId: data.deliveryUserId  || null,
            },
            { where: { id: data.id } }
        );
    }

    return shipment;
};

const getByTrackingId = (trackingId) => {
    const { Person }       = require('./person');
    const { Status }       = require('./status');
    const { Address }      = require('./address');
    const { Province }     = require('./province');
    const { TypeShipment } = require('./typeShipment');
    const { User }         = require('./user');

    return Shipment.findOne({
        where: { trackingId },
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false }
        ]
    });
};

const updateStatus = (id, newStatusId, options = {}) => {
    const updates = { statusId: newStatusId };
    if (options.deliveryUserId !== undefined) {
        updates.deliveryUserId = options.deliveryUserId;
    }
    return Shipment.update(updates, { where: { id }, transaction: options.transaction });
};

const findByIdForUpdate = (id, transaction) => Shipment.findOne({
    where: { id },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
});

module.exports = { Shipment, getAll, getById, create, update, search, updateStatus, findByLegacyTrackingId, findPotentialDuplicate, getByTrackingId, findByIdForUpdate };
