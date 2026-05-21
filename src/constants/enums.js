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

module.exports = {
    Status, PersonType, RoleType, ShipmentType, ShipmentPriority,
    IncidentStatus, IncidentResolution, IncidentChannel, IncidentEventType, IncidentPriority
};
