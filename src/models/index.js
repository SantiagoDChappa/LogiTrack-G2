// Importar modelos SIN asociaciones
const { Address }         = require('./address');
const { Branch }          = require('./branch');
const { Person }          = require('./person');
const { Province }        = require('./province');
const { Status }          = require('./status');
const { TypeShipment }    = require('./typeShipment');
const { User }            = require('./user');
const { Shipment }        = require('./shipment');
const { ShipmentHistory } = require('./shipmentHistory');
const { DeliveryEvidence } = require('./deliveryEvidence');
const { FailedAttempt }    = require('./failedAttempt');
const { ShipmentImport }  = require('./shipmentImport');

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
        if (Status)       { Shipment.belongsTo(Status,       { as: 'status',       foreignKey: 'statusId' }); }
        if (Address)      { Shipment.belongsTo(Address,      { as: 'address',      foreignKey: 'addressId' }); }
        if (TypeShipment) { Shipment.belongsTo(TypeShipment, { as: 'shipmentType', foreignKey: 'shipmentTypeId' }); }
        if (User)         { Shipment.belongsTo(User,         { as: 'deliveryUser', foreignKey: 'deliveryUserId' }); }
    }

    if (User.belongsTo && Branch) {
        User.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' });
    }

    if (ShipmentHistory.belongsTo) {
        if (Status) {
            ShipmentHistory.belongsTo(Status, { as: 'fromStatus', foreignKey: 'fromStatusId' });
            ShipmentHistory.belongsTo(Status, { as: 'toStatus',   foreignKey: 'toStatusId'   });
        }
        if (User)   { ShipmentHistory.belongsTo(User,   { as: 'user',   foreignKey: 'userId'   }); }
        if (Branch) { ShipmentHistory.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' }); }
    }

    if (DeliveryEvidence.belongsTo && Shipment) {
        DeliveryEvidence.belongsTo(Shipment, {
            as: 'shipment',
            foreignKey: 'shipmentId'
        });
    }

    if (FailedAttempt.belongsTo && Shipment) {
    FailedAttempt.belongsTo(Shipment, {
        as: 'shipment',
        foreignKey: 'shipmentId'
    });
}

    if (ShipmentImport.belongsTo && User) {
        ShipmentImport.belongsTo(User, { as: 'user', foreignKey: 'userId' });
    }
};

safeAssociate();

module.exports = {
    Address,
    Branch,
    Person,
    Province,
    Status,
    TypeShipment,
    User,
    Shipment,
    ShipmentHistory,
    DeliveryEvidence,
    FailedAttempt,
    ShipmentImport
};
