const Status = Object.freeze({
    PENDING:    { id: 1, description: 'Pendiente'   },
    IN_TRANSIT: { id: 2, description: 'En Transito' },
    AT_BRANCH:  { id: 3, description: 'En Sucursal' },
    DELIVERED:  { id: 4, description: 'Entregado'   },
    CANCELLED:  { id: 5, description: 'Cancelado'   },
});

const PersonType = Object.freeze({
    SENDER:    { id: 1, description: 'Remitente'   },
    RECIPIENT: { id: 2, description: 'Destinatario' },
});

const RoleType = Object.freeze({
    SUPERVISOR:     { id: 1, description: 'Supervisor'   },
    OPERATOR:       { id: 2, description: 'Operador'     },
    DELIVERY:       { id: 3, description: 'Repartidor'   },
});

module.exports = { Status, PersonType, RoleType };
