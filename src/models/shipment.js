const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');
const { Person }       = require('./person');
const { Status }       = require('./status');
const { Address }      = require('./address');
const { Province }     = require('./province');
const { TypeShipment } = require('./typeShipment');

const Shipment = sequelize.define('shipment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    trackingId:      { type: DataTypes.STRING },
    statusId:        { type: DataTypes.INTEGER },
    createdAt:       { type: DataTypes.DATE },
    senderId:        { type: DataTypes.INTEGER },
    recipientId:     { type: DataTypes.INTEGER },
    addressId:       { type: DataTypes.INTEGER },
    shipmentTypeId:  { type: DataTypes.INTEGER },
    weightKg:        { type: DataTypes.DECIMAL(8, 2) },
    packageQty:      { type: DataTypes.INTEGER }
},
{ timestamps: true, tableName: 'shipment' });

Shipment.belongsTo(Person,       { as: 'sender',       foreignKey: 'senderId'       });
Shipment.belongsTo(Person,       { as: 'recipient',    foreignKey: 'recipientId'    });
Shipment.belongsTo(Status,       { as: 'status',       foreignKey: 'statusId'       });
Shipment.belongsTo(Address,      { as: 'address',      foreignKey: 'addressId'      });
Shipment.belongsTo(TypeShipment, { as: 'shipmentType', foreignKey: 'shipmentTypeId' });

const defaultIncludes = [
    { model: Person,       as: 'sender'       },
    { model: Person,       as: 'recipient'    },
    { model: Status,       as: 'status'       },
    { model: Address,      as: 'address',      include: [{ model: Province, as: 'province' }] },
    { model: TypeShipment, as: 'shipmentType' },
];

const getAll = async () => {
    return await Shipment.findAll({ include: defaultIncludes });
};

const getById = async (id) => {
    return await Shipment.findOne({
        where: { id },
        include: defaultIncludes
    });
};

const generateTrackingId = async () => {
    const last = await Shipment.findOne({ order: [['id', 'DESC']] });
    const next = last ? last.id + 1 : 1;
    return `ENV-${String(next).padStart(3, '0')}`;
};

const create = async (data) => {
    const trackingId = await generateTrackingId();
    return await Shipment.create({
        trackingId,
        statusId:       1,
        senderId:       data.senderId,
        recipientId:    data.recipientId,
        addressId:      data.addressId,
        shipmentTypeId: data.shipmentTypeId || null,
        weightKg:       data.weightKg       || null,
        packageQty:     data.packageQty      || null,
        createdAt:      new Date().toISOString().split('T')[0]
    });
};

const search = async ({ trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds }) => {
    const shipmentWhere  = {};
    const senderWhere    = {};
    const recipientWhere = {};

    if (statusIds && statusIds.length > 0) {
        shipmentWhere.statusId = { [Op.in]: statusIds.map(Number) };
    }

    if (trackingId) shipmentWhere.trackingId = { [Op.iLike]: `%${trackingId}%` };

    const isBoth      = !role || role === 'both';
    const isSender    = role === 'sender';
    const isRecipient = role === 'recipient';

    if (isBoth) {
        if (senderName)        senderWhere.fullName    = { [Op.iLike]: `%${senderName}%` };
        if (senderDocument)    senderWhere.document    = senderDocument;
        if (recipientName)     recipientWhere.fullName = { [Op.iLike]: `%${recipientName}%` };
        if (recipientDocument) recipientWhere.document = recipientDocument;
    } else if (isSender) {
        if (name)     senderWhere.fullName = { [Op.iLike]: `%${name}%` };
        if (document) senderWhere.document = document;
    } else if (isRecipient) {
        if (name)     recipientWhere.fullName = { [Op.iLike]: `%${name}%` };
        if (document) recipientWhere.document = document;
    }

    return await Shipment.findAll({
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

const existsByDocument = async (document) => {
    if (!document) return false;

    const person = await Person.findOne({ where: { document } });
    if (!person) return false;

    const result = await Shipment.findOne({
        where: {
            [Op.or]: [
                { senderId:    person.id },
                { recipientId: person.id },
            ]
        }
    });
    return result !== null;
};


const update = async (data) => {
    const shipment = await Shipment.findOne({ where: { id: data.id } });
    if (!shipment) return null;

    await Person.update(
        { fullName: data.recipientName, document: data.recipientDocument, phone: data.recipientPhone, email: data.recipientEmail },
        { where: { id: shipment.recipientId } }
    );

    await Address.update(
        { street: data.street, number: data.number, provinceId: data.province, postalCode: data.postalCode, floorApartment: data.floorApartment, lat: data.addressLat || null, lng: data.addressLng || null },
        { where: { id: shipment.addressId } }
    );

    await Shipment.update(
        {
            shipmentTypeId: data.shipmentTypeId || null,
            weightKg:       data.weightKg       || null,
            packageQty:     data.packageQty      || null,
        },
        { where: { id: data.id } }
    );

    return shipment;
};

const updateStatus = async (id, newStatusId) => {
    return await Shipment.update({ statusId: newStatusId }, { where: { id } });
};

module.exports = { Shipment, getAll, getById, create, update, search, existsByDocument, updateStatus };
