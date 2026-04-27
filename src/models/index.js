const sequelize = require('../database/connection');

// Importar modelos SIN asociaciones
const { Address }         = require('./address');
const { Person }          = require('./person');
const { Province }        = require('./province');
const { Status }          = require('./status');
const { TypeShipment }    = require('./typeShipment');
const { User }            = require('./user');
const { Shipment }        = require('./shipment');
const { ShipmentHistory } = require('./shipmentHistory');

// Asociar SOLO si el modelo fue cargado correctamente (evita errores en circularidad parcial)
const safeAssociate = () => {
    if (Address.belongsTo && Province) {
        Address.belongsTo(Province, { as: 'province', foreignKey: 'provinceId' });
    }

    if (Shipment.belongsTo) {
        if (Person) {
            Shipment.belongsTo(Person, { as: 'sender',    foreignKey: 'senderId' });
            Shipment.belongsTo(Person, { as: 'recipient', foreignKey: 'recipientId' });
        }
        if (Status)       Shipment.belongsTo(Status,       { as: 'status',       foreignKey: 'statusId' });
        if (Address)      Shipment.belongsTo(Address,      { as: 'address',      foreignKey: 'addressId' });
        if (TypeShipment) Shipment.belongsTo(TypeShipment, { as: 'shipmentType', foreignKey: 'shipmentTypeId' });
        if (User)         Shipment.belongsTo(User,         { as: 'deliveryUser', foreignKey: 'deliveryUserId' });
    }

    if (ShipmentHistory.belongsTo) {
        if (Status) {
            ShipmentHistory.belongsTo(Status, { as: 'fromStatus', foreignKey: 'fromStatusId' });
            ShipmentHistory.belongsTo(Status, { as: 'toStatus',   foreignKey: 'toStatusId'   });
        }
        if (User) ShipmentHistory.belongsTo(User, { as: 'user', foreignKey: 'userId' });
    }
};

safeAssociate();

module.exports = {
    Address,
    Person,
    Province,
    Status,
    TypeShipment,
    User,
    Shipment,
    ShipmentHistory
};
