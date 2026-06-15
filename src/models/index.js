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
const { FatigueCheck }    = require('./fatigueCheck');
const { FatigueConfig }   = require('./fatigueConfig');
const { FatigueAudit }    = require('./fatigueAudit');
const { FatiguePatternCounter } = require('./fatiguePatternCounter');
const { ReturnToBranchScan } = require('./returnToBranchScan');
const { IncidentType }    = require('./incidentType');
const { Incident }        = require('./incident');
const { IncidentHistory } = require('./incidentHistory');
const { IncidentTaskTemplate } = require('./incidentTaskTemplate');
const { IncidentTask }         = require('./incidentTask');
const { IncidentAttachment }   = require('./incidentAttachment');
const { IncidentPendingConfirmation } = require('./incidentPendingConfirmation');
const { ShipmentModificationRequest } = require('./shipmentModificationRequest');
const { ShipmentReturn, ShipmentReturnHistory } = require('./shipmentReturn');
// Sprint 3 - nuevos modelos parametrizables
const { FailedAttemptReason } = require('./failedAttemptReason');
const { StandardMessage }     = require('./standardMessage');
const { DeliveryTimeWindow }  = require('./deliveryTimeWindow');

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
        if (Branch) {
            Shipment.belongsTo(Branch, { as: 'currentBranch', foreignKey: 'currentBranchId' });
            Shipment.belongsTo(Branch, { as: 'pickupBranch',  foreignKey: 'pickupBranchId'  });
        }
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
    if (FatigueCheck.belongsTo) {
        FatigueCheck.belongsTo(User,   { as: 'driver',   foreignKey: 'userId' });
        FatigueCheck.belongsTo(User,   { as: 'releaser', foreignKey: 'releasedBy' });
        FatigueCheck.belongsTo(Route,  { as: 'route',    foreignKey: 'routeId' });
        FatigueCheck.belongsTo(Branch, { as: 'branch',   foreignKey: 'branchId' });
    }
    if (ReturnToBranchScan.belongsTo) {
        ReturnToBranchScan.belongsTo(Shipment, { as: 'shipment', foreignKey: 'shipmentId' });
        ReturnToBranchScan.belongsTo(Branch,   { as: 'branch',   foreignKey: 'branchId' });
        ReturnToBranchScan.belongsTo(User,     { as: 'user',     foreignKey: 'userId' });
        ReturnToBranchScan.belongsTo(Route,    { as: 'route',    foreignKey: 'routeId' });
    }

    if (Incident.belongsTo) {
        if (Shipment)     { Incident.belongsTo(Shipment,     { as: 'shipment',       foreignKey: 'shipmentId' }); }
        if (IncidentType) { Incident.belongsTo(IncidentType, { as: 'type',           foreignKey: 'incidentTypeId' }); }
        if (User)         {
            Incident.belongsTo(User,   { as: 'openedByUser',   foreignKey: 'openedByUserId' });
            Incident.belongsTo(User,   { as: 'assignedTo',     foreignKey: 'assignedToUserId' });
            Incident.belongsTo(User,   { as: 'closedBy',       foreignKey: 'closedByUserId' });
        }
        if (Person)       { Incident.belongsTo(Person,       { as: 'openedByPerson', foreignKey: 'openedByPersonId' }); }
    }
    if (Incident.hasMany && IncidentHistory) {
        Incident.hasMany(IncidentHistory, { as: 'history', foreignKey: 'incidentId' });
    }
    if (IncidentHistory.belongsTo) {
        IncidentHistory.belongsTo(Incident, { as: 'incident', foreignKey: 'incidentId' });
        if (User)   { IncidentHistory.belongsTo(User,   { as: 'user',   foreignKey: 'userId' }); }
        if (Person) { IncidentHistory.belongsTo(Person, { as: 'person', foreignKey: 'personId' }); }
    }

    // PR69 - solicitudes de modificación de envío (portal cliente)
    if (ShipmentModificationRequest.belongsTo) {
        if (Shipment) { ShipmentModificationRequest.belongsTo(Shipment, { as: 'shipment', foreignKey: 'shipmentId' }); }
        if (User)     { ShipmentModificationRequest.belongsTo(User, { as: 'reviewedBy', foreignKey: 'reviewedByUserId' }); }
    }
    if (Shipment.hasMany && ShipmentModificationRequest) {
        Shipment.hasMany(ShipmentModificationRequest, { as: 'modificationRequests', foreignKey: 'shipmentId' });
    }

    // Sprint 4 - checklist de tareas por tipo y adjuntos de incidencia
    if (IncidentType.hasMany && IncidentTaskTemplate) {
        IncidentType.hasMany(IncidentTaskTemplate, { as: 'taskTemplates', foreignKey: 'incidentTypeId' });
        IncidentTaskTemplate.belongsTo(IncidentType, { as: 'type', foreignKey: 'incidentTypeId' });
    }
    if (Incident.hasMany && IncidentTask) {
        Incident.hasMany(IncidentTask, { as: 'tasks', foreignKey: 'incidentId' });
        IncidentTask.belongsTo(Incident, { as: 'incident', foreignKey: 'incidentId' });
        if (User) { IncidentTask.belongsTo(User, { as: 'doneBy', foreignKey: 'doneByUserId' }); }
    }
    if (Incident.hasMany && IncidentAttachment) {
        Incident.hasMany(IncidentAttachment, { as: 'attachments', foreignKey: 'incidentId' });
        IncidentAttachment.belongsTo(Incident, { as: 'incident', foreignKey: 'incidentId' });
        if (User)   { IncidentAttachment.belongsTo(User,   { as: 'uploadedByUser',   foreignKey: 'uploadedByUserId' }); }
        if (Person) { IncidentAttachment.belongsTo(Person, { as: 'uploadedByPerson', foreignKey: 'uploadedByPersonId' }); }
    }

    // LGT-182/183/186 - devoluciones
    if (ShipmentReturn.belongsTo) {
        if (Shipment) { ShipmentReturn.belongsTo(Shipment, { as: 'shipment', foreignKey: 'shipmentId' }); }
        if (Branch)   { ShipmentReturn.belongsTo(Branch,   { as: 'pickupBranch', foreignKey: 'pickupBranchId' }); }
        if (User)     { ShipmentReturn.belongsTo(User,     { as: 'reviewedBy', foreignKey: 'reviewedByUserId' }); }
    }
    if (ShipmentReturn.hasMany && ShipmentReturnHistory) {
        ShipmentReturn.hasMany(ShipmentReturnHistory, { as: 'history', foreignKey: 'returnId' });
        ShipmentReturnHistory.belongsTo(ShipmentReturn, { as: 'return', foreignKey: 'returnId' });
        if (User) { ShipmentReturnHistory.belongsTo(User, { as: 'byUser', foreignKey: 'byUserId' }); }
    }
    if (Shipment.hasMany && ShipmentReturn) {
        Shipment.hasMany(ShipmentReturn, { as: 'returns', foreignKey: 'shipmentId' });
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
    FatigueCheck,
    FatigueConfig,
    FatigueAudit,
    FatiguePatternCounter,
    ReturnToBranchScan,
    IncidentType,
    Incident,
    IncidentHistory,
    IncidentTaskTemplate,
    IncidentTask,
    IncidentAttachment,
    IncidentPendingConfirmation,
    ShipmentModificationRequest,
    ShipmentReturn,
    ShipmentReturnHistory,
    FailedAttemptReason,
    StandardMessage,
    DeliveryTimeWindow,
};
