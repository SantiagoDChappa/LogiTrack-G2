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

const NotificationEvent = Object.freeze({
    SHIPMENT_PENDING,
    SHIPMENT_IN_TRANSIT,
    SHIPMENT_IN_BRANCH,
    SHIPMENT_DELIVERED,
    SHIPMENT_CANCELLED,
    SHIPMENT_ASSIGNED,
    SHIPMENT_IN_PREPARATION,
    SHIPMENT_PACKAGE_FAILED,
    SHIPMENT_FAILED_ATTEMPT,
});

module.exports = { Status, PersonType, RoleType, ShipmentType, ShipmentPriority, NotificationEvent };
