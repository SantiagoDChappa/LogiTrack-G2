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
const { Zone }            = require('./zone');
const { Transport }       = require('./transport');
const { TransportZone }   = require('./transportZone');
const { Route }           = require('./route');
const { RouteStop }       = require('./routeStop');
const { RoutePause }      = require('./routePause');
const { RouteIncident }   = require('./routeIncident');
const { PanicEvent }      = require('./panicEvent');
const { ReturnToBranchScan } = require('./returnToBranchScan');

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

    // Routing optimization associations
    if (Zone.belongsTo && Province) {
        Zone.belongsTo(Province, { as: 'province', foreignKey: 'provinceId' });
    }

    if (Shipment.belongsTo) {
        if (Zone)   { Shipment.belongsTo(Zone,   { as: 'zone',          foreignKey: 'zoneId' }); }
        if (Branch) { Shipment.belongsTo(Branch, { as: 'currentBranch', foreignKey: 'currentBranchId' }); }
    }

    if (Transport.belongsTo) {
        if (User)   { Transport.belongsTo(User,   { as: 'driver', foreignKey: 'driverUserId' }); }
        if (Branch) { Transport.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' }); }
    }
    if (Transport.belongsToMany && Zone) {
        Transport.belongsToMany(Zone, {
            through: TransportZone, as: 'zones',
            foreignKey: 'transportId', otherKey: 'zoneId',
        });
        Zone.belongsToMany(Transport, {
            through: TransportZone, as: 'transports',
            foreignKey: 'zoneId', otherKey: 'transportId',
        });
    }

    if (Route.belongsTo) {
        Route.belongsTo(Transport, { as: 'transport',    foreignKey: 'transportId' });
        Route.belongsTo(Branch,    { as: 'originBranch', foreignKey: 'originBranchId' });
        Route.belongsTo(Status,    { as: 'status',       foreignKey: 'statusId' });
    }
    if (Route.hasMany) {
        Route.hasMany(RouteStop, { as: 'stops', foreignKey: 'routeId' });
    }
    if (RouteStop.belongsTo) {
        RouteStop.belongsTo(Route,    { as: 'route',    foreignKey: 'routeId' });
        RouteStop.belongsTo(Branch,   { as: 'branch',   foreignKey: 'branchId' });
        RouteStop.belongsTo(Shipment, { as: 'shipment', foreignKey: 'shipmentId' });
    }

    if (RoutePause.belongsTo) {
        RoutePause.belongsTo(Route, { as: 'route', foreignKey: 'routeId' });
        RoutePause.belongsTo(User,  { as: 'user',  foreignKey: 'userId' });
    }
    if (RouteIncident.belongsTo) {
        RouteIncident.belongsTo(Route, { as: 'route', foreignKey: 'routeId' });
        RouteIncident.belongsTo(User,  { as: 'user',  foreignKey: 'userId' });
    }
    if (PanicEvent.belongsTo) {
        PanicEvent.belongsTo(User,  { as: 'user',  foreignKey: 'userId' });
        PanicEvent.belongsTo(Route, { as: 'route', foreignKey: 'routeId' });
    }
    if (ReturnToBranchScan.belongsTo) {
        ReturnToBranchScan.belongsTo(Shipment, { as: 'shipment', foreignKey: 'shipmentId' });
        ReturnToBranchScan.belongsTo(Branch,   { as: 'branch',   foreignKey: 'branchId' });
        ReturnToBranchScan.belongsTo(User,     { as: 'user',     foreignKey: 'userId' });
        ReturnToBranchScan.belongsTo(Route,    { as: 'route',    foreignKey: 'routeId' });
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
    ShipmentImport,
    Zone,
    Transport,
    TransportZone,
    Route,
    RouteStop,
    RoutePause,
    RouteIncident,
    PanicEvent,
    ReturnToBranchScan
};
