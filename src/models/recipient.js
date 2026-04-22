const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');


// Defino la tabla envio
const Shipment = sequelize.define('shipment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    trackingId:  { type: DataTypes.CHAR },
    statusId:    { type: DataTypes.INTEGER },
    createdAt:   { type: DataTypes.DATE },
    senderId:    { type: DataTypes.INTEGER },
    recipientId: { type: DataTypes.INTEGER },
    addressId:   { type: DataTypes.INTEGER }
    },
    { timestamps: true }
);

const getAll = async () => {
    const data = await Shipment.findAll();
    console.log(data);
    return data;
};

const getById = (id) => {
    return getAll().find(s => s.id === id);
};

const generateId = (shipments) => {
    const nums = shipments
        .map(s => parseInt(s.id?.replace('ENV-', '')) || 0)
        .filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `ENV-${String(next).padStart(3, '0')}`;
};

const create = (data) => {
   Shipment.create({
        trackingId: generateId([]),
        statusId: 1,
        senderId: data.senderId,
        recipientId: data.recipientId ,
        addressId: data.addressId,
        createdAt: new Date().toISOString().split('T')[0],
    });
};

const search = ({ trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument }) => {
    const hasFilter = trackingId || name || document || senderName || senderDocument || recipientName || recipientDocument;
    if (!hasFilter) return getAll();

    const isBoth      = !role || role === 'both';
    const isSender    = role === 'sender';
    const isRecipient = role === 'recipient';

    return getAll().filter(s => {
        if (!s.sender || !s.recipient) return false;

        if (trackingId && !s.id.toLowerCase().includes(trackingId.toLowerCase())) return false;

        if (isBoth) {
            if (senderName        && !s.sender.name.toLowerCase().includes(senderName.toLowerCase()))       return false;
            if (senderDocument    && !s.sender.document.includes(senderDocument))                           return false;
            if (recipientName     && !s.recipient.name.toLowerCase().includes(recipientName.toLowerCase())) return false;
            if (recipientDocument && !s.recipient.document.includes(recipientDocument))                     return false;
        } else if (isSender) {
            if (name     && !s.sender.name.toLowerCase().includes(name.toLowerCase())) return false;
            if (document && !s.sender.document.includes(document))                     return false;
        } else if (isRecipient) {
            if (name     && !s.recipient.name.toLowerCase().includes(name.toLowerCase())) return false;
            if (document && !s.recipient.document.includes(document))                     return false;
        }

        return true;
    });
};

module.exports = { Shipment, getAll, getById, create, search };
