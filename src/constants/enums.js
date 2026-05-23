const Status = Object.freeze({
    PENDING:        { id: 1, description: 'Pendiente'       },
    IN_TRANSIT:     { id: 2, description: 'En Transito'     },
    AT_BRANCH:      { id: 3, description: 'En Sucursal'     },
    DELIVERED:      { id: 4, description: 'Entregado'       },
    CANCELLED:      { id: 5, description: 'Cancelado'       },
    ASSIGNED:       { id: 6, description: 'Asignado'        },
    IN_PREPARATION: { id: 7, description: 'En Preparacion'  },
    PACKAGE_FAILED: { id: 8, description: 'Paquete Fallido' },
    FAILED_ATTEMPT: { id: 9, description: 'Intento Fallido' },
});

const PersonType = Object.freeze({
    SENDER:    { id: 1, description: 'Remitente'   },
    RECIPIENT: { id: 2, description: 'Destinatario' },
});

const RoleType = Object.freeze({
    SUPERVISOR: { id: 1, description: 'Supervisor'    },
    OPERATOR:   { id: 2, description: 'Operador'      },
    DELIVERY:   { id: 3, description: 'Repartidor'    },
    ADMIN:      { id: 4, description: 'Administrador' },
});

const ShipmentType = Object.freeze({
    EXPRESS:  { id: 1, description: 'Express'  },
    STANDARD: { id: 2, description: 'Standard' },
});

const ShipmentPriority = Object.freeze({
    LOW:    { id: 1, description: 'Baja'   },
    MEDIUM: { id: 2, description: 'Media'   },
    HIGH:   { id: 3, description: 'Alta'    },
    URGENT: { id: 4, description: 'Urgente' },
});

const IncidentStatus = Object.freeze({
    OPEN:      'OPEN',
    IN_REVIEW: 'IN_REVIEW',
    CLOSED:    'CLOSED',
});

const IncidentResolution = Object.freeze({
    PROCEDENTE:    'PROCEDENTE',
    NO_PROCEDENTE: 'NO_PROCEDENTE',
});

const IncidentChannel = Object.freeze({
    PORTAL:   'PORTAL',
    INTERNAL: 'INTERNAL',
});

const IncidentEventType = Object.freeze({
    CREATED:         'CREATED',
    STATUS_CHANGE:   'STATUS_CHANGE',
    ASSIGNED:        'ASSIGNED',
    ESCALATED:       'ESCALATED',
    UNESCALATED:     'UNESCALATED',
    PRIORITY_CHANGE: 'PRIORITY_CHANGE',
    COMMENT:         'COMMENT',
    CLOSED:          'CLOSED',
    REOPENED:        'REOPENED',
});

const IncidentPriority = Object.freeze({
    LOW:    { id: 1, description: 'Baja'    },
    MEDIUM: { id: 2, description: 'Media'   },
    HIGH:   { id: 3, description: 'Alta'    },
    URGENT: { id: 4, description: 'Urgente' },
});

const NotificationEvent = Object.freeze({
    SHIPMENT_PENDING:        'SHIPMENT_PENDING',
    SHIPMENT_IN_TRANSIT:     'SHIPMENT_IN_TRANSIT',
    SHIPMENT_IN_BRANCH:      'SHIPMENT_IN_BRANCH',
    SHIPMENT_DELIVERED:      'SHIPMENT_DELIVERED',
    SHIPMENT_CANCELLED:      'SHIPMENT_CANCELLED',
    SHIPMENT_ASSIGNED:       'SHIPMENT_ASSIGNED',
    SHIPMENT_IN_PREPARATION: 'SHIPMENT_IN_PREPARATION',
    SHIPMENT_PACKAGE_FAILED: 'SHIPMENT_PACKAGE_FAILED',
    SHIPMENT_FAILED_ATTEMPT: 'SHIPMENT_FAILED_ATTEMPT',
});

const mapperShipmentStatusToEvent = {
    [Status.PENDING.id]:        NotificationEvent.SHIPMENT_PENDING,
    [Status.IN_TRANSIT.id]:     NotificationEvent.SHIPMENT_IN_TRANSIT,
    [Status.AT_BRANCH.id]:      NotificationEvent.SHIPMENT_IN_BRANCH,
    [Status.DELIVERED.id]:      NotificationEvent.SHIPMENT_DELIVERED,
    [Status.CANCELLED.id]:      NotificationEvent.SHIPMENT_CANCELLED,
    [Status.ASSIGNED.id]:       NotificationEvent.SHIPMENT_ASSIGNED,
    [Status.IN_PREPARATION.id]: NotificationEvent.SHIPMENT_IN_PREPARATION,
    [Status.PACKAGE_FAILED.id]: NotificationEvent.SHIPMENT_PACKAGE_FAILED,
    [Status.FAILED_ATTEMPT.id]: NotificationEvent.SHIPMENT_FAILED_ATTEMPT,
};

module.exports = {
    Status, PersonType, RoleType, ShipmentType, ShipmentPriority,
    IncidentStatus, IncidentResolution, IncidentChannel, IncidentEventType, IncidentPriority,
    NotificationEvent, mapperShipmentStatusToEvent
};
