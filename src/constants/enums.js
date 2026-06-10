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

const IncidentStatusLabel = Object.freeze({
    OPEN:      'Abierta',
    IN_REVIEW: 'En revisión',
    CLOSED:    'Cerrada',
});

const IncidentResolution = Object.freeze({
    PROCEDENTE:    'PROCEDENTE',
    NO_PROCEDENTE: 'NO_PROCEDENTE',
});

const IncidentResolutionLabel = Object.freeze({
    PROCEDENTE:    'Procedente',
    NO_PROCEDENTE: 'No procedente',
});

const IncidentChannel = Object.freeze({
    PORTAL:   'PORTAL',
    INTERNAL: 'INTERNAL',
    SYSTEM:   'SYSTEM',
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
    CHECKLIST_ITEM:  'CHECKLIST_ITEM',
    EVIDENCE_ADDED:  'EVIDENCE_ADDED',
    AUTO_CREATED:    'AUTO_CREATED',
    AUTO_CLOSED:     'AUTO_CLOSED',
});

const IncidentPriority = Object.freeze({
    LOW:    { id: 1, description: 'Baja'    },
    MEDIUM: { id: 2, description: 'Media'   },
    HIGH:   { id: 3, description: 'Alta'    },
    URGENT: { id: 4, description: 'Urgente' },
});

const NotificationEvent = Object.freeze({
    SHIPMENT_PENDING:             'SHIPMENT_PENDING',
    SHIPMENT_IN_TRANSIT:          'SHIPMENT_IN_TRANSIT',
    SHIPMENT_IN_BRANCH:           'SHIPMENT_IN_BRANCH',
    SHIPMENT_DELIVERED:           'SHIPMENT_DELIVERED',
    SHIPMENT_CANCELLED:           'SHIPMENT_CANCELLED',
    SHIPMENT_ASSIGNED:            'SHIPMENT_ASSIGNED',
    SHIPMENT_IN_PREPARATION:      'SHIPMENT_IN_PREPARATION',
    SHIPMENT_PACKAGE_FAILED:              'SHIPMENT_PACKAGE_FAILED',
    SHIPMENT_PACKAGE_FAILED_UNDELIVERED:  'SHIPMENT_PACKAGE_FAILED_UNDELIVERED',
    SHIPMENT_PACKAGE_FAILED_DELAY:        'SHIPMENT_PACKAGE_FAILED_DELAY',
    SHIPMENT_PACKAGE_FAILED_ATTEMPT:      'SHIPMENT_PACKAGE_FAILED_ATTEMPT',
    SHIPMENT_FAILED_ATTEMPT:      'SHIPMENT_FAILED_ATTEMPT',
    // Sprint 3 — eventos extendidos PDF 2.3
    SHIPMENT_OUT_FOR_DELIVERY:    'SHIPMENT_OUT_FOR_DELIVERY',   // Salida a reparto
    SHIPMENT_NEXT_DELIVERY:       'SHIPMENT_NEXT_DELIVERY',      // Próxima entrega (ETA cercana)
    SHIPMENT_ARRIVED_DESTINATION: 'SHIPMENT_ARRIVED_DESTINATION',// Llegada al domicilio
    SHIPMENT_RETURNED_BRANCH:     'SHIPMENT_RETURNED_BRANCH',    // Vuelta a sucursal
    SHIPMENT_RESCHEDULED:         'SHIPMENT_RESCHEDULED',        // Reprogramación
    SHIPMENT_INCIDENT:            'SHIPMENT_INCIDENT',           // Incidencia / demora
    ROUTE_CANCELLED:              'ROUTE_CANCELLED',
    ROUTE_INTERRUPTED:            'ROUTE_INTERRUPTED',
    SHIPMENT_DELAYED:             'SHIPMENT_DELAYED',
    SHIPMENT_DELAY_RECOVERED:     'SHIPMENT_DELAY_RECOVERED', // LGT-160 Esc.6
    // Mail transaccional del portal cliente "Mis Envíos" (confirmación de acceso).
    // Editable desde Ajustes → Comunicaciones; siempre activo (no es un evento de envío).
    PORTAL_CLIENT_ACCESS:         'PORTAL_CLIENT_ACCESS',
    // Cambio de estado de una incidencia → aviso al cliente. Editable desde Ajustes.
    INCIDENT_STATUS_CHANGE:       'INCIDENT_STATUS_CHANGE',
    // LGT-195: el transportista rechazó el consentimiento de fatiga las veces parametrizadas
    // → queda inhabilitado y se notifica a los Supervisores de su sucursal + administradores.
    FATIGUE_DRIVER_DISABLED_CONSENT: 'FATIGUE_DRIVER_DISABLED_CONSENT',
});

// Tipos de evento en shipment_history (timeline ruteo PDF 2.1)
const ShipmentHistoryEvent = Object.freeze({
    STATUS_CHANGE:           'STATUS_CHANGE',
    OUT_FOR_DELIVERY:        'OUT_FOR_DELIVERY',
    ARRIVED_DESTINATION:     'ARRIVED_DESTINATION',
    RETRY_SAME_DAY:          'RETRY_SAME_DAY',
    RESCHEDULED:             'RESCHEDULED',
    RETURNED_TO_BRANCH:      'RETURNED_TO_BRANCH',
    ROUTE_ASSIGNED:          'ROUTE_ASSIGNED',
    INCIDENT_OPENED:         'INCIDENT_OPENED',
    MODIFICATION_APPLIED:    'MODIFICATION_APPLIED',
    MODIFICATION_REQUESTED:  'MODIFICATION_REQUESTED',
    MODIFICATION_REJECTED:   'MODIFICATION_REJECTED',
});

const ModificationRequestStatus = Object.freeze({
    PENDING_REVIEW: 'PENDING_REVIEW',
    APPLIED:        'APPLIED',
    REJECTED:       'REJECTED',
});

const ModificationChangeType = Object.freeze({
    DELIVERY_WINDOW:     'DELIVERY_WINDOW',
    DELIVERY_MODE:       'DELIVERY_MODE',
    PICKUP_BRANCH:       'PICKUP_BRANCH',
    DELIVERY_REFERENCES: 'DELIVERY_REFERENCES',
    ADDRESS_CHANGE:      'ADDRESS_CHANGE',
    MIXED:               'MIXED',
});

const ModificationChannel = Object.freeze({
    PORTAL: 'PORTAL',
});

// Razones formales de falla de ruta PDF 2.4
const RouteFailureReason = Object.freeze({
    DRIVER_UNAVAILABLE:  'DRIVER_UNAVAILABLE',
    VEHICLE_OUT_SERVICE: 'VEHICLE_OUT_SERVICE',
    WEATHER:             'WEATHER',
    INCIDENT:            'INCIDENT',
    OPERATIONAL:         'OPERATIONAL',
    OTHER:               'OTHER',
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

const EmailQueueStatus = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    SENT: 'SENT',
    FAILED: 'FAILED'
};


module.exports = {
    Status, PersonType, RoleType, ShipmentType, ShipmentPriority,
    IncidentStatus, IncidentStatusLabel, IncidentResolution, IncidentResolutionLabel,
    IncidentChannel, IncidentEventType, IncidentPriority,
    NotificationEvent, mapperShipmentStatusToEvent, EmailQueueStatus,
    ShipmentHistoryEvent, RouteFailureReason,
    ModificationRequestStatus, ModificationChangeType, ModificationChannel,
};
