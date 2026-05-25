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
    volumeM3:         { type: DataTypes.DECIMAL(8, 3) },
    packageQty:       { type: DataTypes.INTEGER },
    deliveryUserId:   { type: DataTypes.INTEGER },
    legacyTrackingId: { type: DataTypes.STRING },
    zoneId:               { type: DataTypes.INTEGER },
    currentBranchId:      { type: DataTypes.INTEGER },
    expectedDeliveryDate: { type: DataTypes.DATEONLY },
    expectedDeliveryFrom: { type: DataTypes.TIME, allowNull: true },
    expectedDeliveryTo:   { type: DataTypes.TIME, allowNull: true },
    priority:             { type: DataTypes.INTEGER, defaultValue: 1 },
    basePriority:         { type: DataTypes.INTEGER, defaultValue: 1 },
    codAmount:            { type: DataTypes.DECIMAL(12, 2), allowNull: true,  field: 'cod_amount' },
    codMethod:            { type: DataTypes.STRING(20),     allowNull: true,  field: 'cod_method' },
    specialInstructions:  { type: DataTypes.TEXT,           allowNull: true,  field: 'special_instructions' },
    fragile:              { type: DataTypes.BOOLEAN,        allowNull: false, defaultValue: false, field: 'fragile' },
    refrigerated:         { type: DataTypes.BOOLEAN,        allowNull: false, defaultValue: false, field: 'refrigerated' },
    oversized:            { type: DataTypes.BOOLEAN,        allowNull: false, defaultValue: false, field: 'oversized' },
    estimatedMinutes:     { type: DataTypes.INTEGER,        allowNull: false, defaultValue: 5,     field: 'estimated_minutes' },
    deliveryMode:         { type: DataTypes.STRING(20),     allowNull: false, defaultValue: 'home', field: 'delivery_mode' },
    pickupBranchId:       { type: DataTypes.INTEGER,        allowNull: true,  field: 'pickup_branch_id' },
    // Sprint 3 - 4.1 Código clave de entrega
    deliverySecretCode:   { type: DataTypes.STRING(10),     allowNull: true,  field: 'delivery_secret_code' },
    // Sprint 3 - 3.2 Portal autogestión (token público para cambiar franja/modalidad)
    portalToken:          { type: DataTypes.STRING(60),     allowNull: true,  field: 'portal_token' },
},
{ timestamps: true, tableName: 'shipment' });

const getAll = () => {
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { Address } = require('./address');
    const { Province } = require('./province');
    const { TypeShipment } = require('./typeShipment');
    const { User } = require('./user');
    
    const { Branch } = require('./branch');

    return Shipment.findAll({
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false },
            { model: Branch, as: 'pickupBranch', required: false }
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
    const { Branch } = require('./branch');
    const { Zone } = require('./zone');

    return Shipment.findOne({
        where: { id },
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false },
            { model: Branch, as: 'currentBranch', required: false },
            { model: Branch, as: 'pickupBranch',  required: false },
            { model: Zone, as: 'zone', required: false }
        ]
    });
};

const generateTrackingId = async (prefix = 'ENV') => {
    const last = await Shipment.findOne({
        where: { trackingId: { [Op.like]: `${prefix}-%` } },
        order: [['id', 'DESC']],
    });
    if (!last) { return `${prefix}-001`; }
    const lastNum = parseInt(String(last.trackingId).split('-').pop(), 10) || 0;
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
};

const create = async (data) => {
    const trackingId = await generateTrackingId(data.trackingPrefix || 'ENV');
    const { generateSecretCode, generatePortalToken } = require('../utils/shipmentTokens');
    return Shipment.create({
        trackingId,
        deliverySecretCode: data.deliverySecretCode || generateSecretCode(),
        portalToken:        data.portalToken        || generatePortalToken(),
        statusId:         data.statusId || 1,
        senderId:         data.senderId,
        recipientId:      data.recipientId,
        addressId:        data.addressId,
        deliveryMode:     data.deliveryMode    || 'home',
        pickupBranchId:   data.pickupBranchId  || null,
        shipmentTypeId:   data.shipmentTypeId || null,
        weightKg:         data.weightKg       || null,
        volumeM3:         data.volumeM3        || null,
        packageQty:       data.packageQty      || null,
        zoneId:               data.zoneId          || null,
        currentBranchId:      data.currentBranchId || null,
        expectedDeliveryDate: data.expectedDeliveryDate || null,
        expectedDeliveryFrom: data.expectedDeliveryFrom || null,
        expectedDeliveryTo:   data.expectedDeliveryTo   || null,
        deliveryUserId:       data.deliveryUserId  || null,
        legacyTrackingId: data.legacyTrackingId || null,
        priority:         data.priority     || 1,
        basePriority:     data.basePriority || 1,
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

const search = ({ trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds, deliveryUserId, currentBranchId }) => {
    const { Person } = require('./person');
    const { Status } = require('./status');
    const { Address } = require('./address');
    
    const shipmentWhere  = {};
    const senderWhere    = {};
    const recipientWhere = {};

    if (deliveryUserId) { shipmentWhere.deliveryUserId = deliveryUserId; }

    if (currentBranchId) { shipmentWhere.currentBranchId = Number(currentBranchId); }

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

    // Entregado, Cancelado, En Sucursal, Paquete Fallido, Intento Fallido — solo deliveryUserId si corresponde
    if (statusId === 4 || statusId === 5 || statusId === 3 || statusId === 8 || statusId === 9) {
        if (data.deliveryUserId !== undefined) {
             await Shipment.update(
                { deliveryUserId: data.deliveryUserId || null },
                { where: { id: data.id } }
            );
        }
        return shipment;
    }

    // En Tránsito, Asignado, En Preparación — solo contacto destinatario + deliveryUserId
    if (statusId === 2 || statusId === 6 || statusId === 7) {
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

    if (statusId === 1) { // Pendiente — modificación completa
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
                deliveryUserId:  data.deliveryUserId  || null,
                weightKg:        data.weightKg        || shipment.weightKg,
                packageQty:      data.packageQty      || shipment.packageQty,
                shipmentTypeId:  data.shipmentTypeId  || shipment.shipmentTypeId,
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

    const { Branch } = require('./branch');
    return Shipment.findOne({
        where: { trackingId },
        include: [
            { model: Person, as: 'sender' },
            { model: Person, as: 'recipient' },
            { model: Status, as: 'status' },
            { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province' }] },
            { model: TypeShipment, as: 'shipmentType' },
            { model: User, as: 'deliveryUser', required: false },
            { model: Branch, as: 'pickupBranch', required: false }
        ]
    });
};

const updateStatus = (id, newStatusId, options = {}) => {
    const updates = { statusId: newStatusId };
    if (options.deliveryUserId !== undefined) {
        updates.deliveryUserId = options.deliveryUserId;
    }
    if (options.currentBranchId !== undefined) {
        updates.currentBranchId = options.currentBranchId;
    }
    return Shipment.update(updates, { where: { id }, transaction: options.transaction });
};

const findByIdForUpdate = (id, transaction) => Shipment.findOne({
    where: { id },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
});

const getForKanban = (statusIds, { branchId } = {}) => {
    const { Person }    = require('./person');
    const { Status }    = require('./status');
    const { Address }   = require('./address');
    const { Province }  = require('./province');
    const { User }      = require('./user');

    const where = { statusId: { [Op.in]: statusIds } };
    if (branchId) { where.currentBranchId = Number(branchId); }

    return Shipment.findAll({
        where,
        include: [
            { model: Person,  as: 'recipient' },
            { model: Status,  as: 'status' },
            { model: Address, as: 'address', include: [{ model: Province, as: 'province' }] },
            { model: User,    as: 'deliveryUser', required: false },
        ],
        order: [['createdAt', 'DESC']],
    });
};

const updatePriority = (id, newPriority) => {
    return Shipment.update({ priority: newPriority }, { where: { id } });
};

const getActiveShipments = () => {
    return Shipment.findAll({
        where: { statusId: { [Op.notIn]: [4, 5] } }
    });
};

module.exports = { Shipment, getAll, getById, create, update, search, updateStatus, findByLegacyTrackingId, findPotentialDuplicate, getByTrackingId, findByIdForUpdate, getForKanban, generateTrackingId, updatePriority, getActiveShipments };
