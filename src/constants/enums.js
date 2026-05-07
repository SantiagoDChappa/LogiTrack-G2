const Status = Object.freeze({
    PENDING:        { id: 1, description: 'Pendiente'       },
    IN_TRANSIT:     { id: 2, description: 'En Transito'     },
    AT_BRANCH:      { id: 3, description: 'En Sucursal'     },
    DELIVERED:      { id: 4, description: 'Entregado'       },
    CANCELLED:      { id: 5, description: 'Cancelado'       },
    ASSIGNED:       { id: 6, description: 'Asignado'        },
    IN_PREPARATION: { id: 7, description: 'En Preparacion'  },
    FAILED_PACKAGE: { id: 8, description: 'Paquete Fallido' },
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

module.exports = { Status, PersonType, RoleType };
