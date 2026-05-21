const STATUS_COPY = {
    pendiente: {
        label: 'Pendiente',
        summary: 'Tu envio fue registrado, pero todavia no empezo a moverse.',
        next: 'Lo normal es que despues pase a preparacion o salga a recorrido.',
    },
    inicial: {
        label: 'Inicial',
        summary: 'Tu envio recien se cargo y todavia esta en una etapa muy temprana.',
        next: 'Todavia puede faltar preparacion antes de que empiece a avanzar.',
    },
    asignado: {
        label: 'Asignado',
        summary: 'Tu envio ya fue tomado para seguir avanzando.',
        next: 'Lo normal ahora es que pase a preparacion o salga en camino.',
    },
    en_preparacion: {
        label: 'En Preparacion',
        summary: 'Tu envio se esta preparando antes de seguir viaje.',
        next: 'Despues suele salir en camino o pasar por una sucursal.',
    },
    en_transito: {
        label: 'En Transito',
        summary: 'Tu envio ya esta en camino.',
        next: 'Lo siguiente puede ser una nueva referencia, una sucursal o la entrega.',
    },
    en_sucursal: {
        label: 'En Sucursal',
        summary: 'Tu envio ya tiene una referencia en sucursal.',
        next: 'Segun el caso, puede seguir viaje, salir a entrega o quedar para retiro.',
    },
    intento_fallido: {
        label: 'Intento Fallido',
        summary: 'No se pudo completar la entrega en la ultima visita.',
        next: 'Puede resolverse con un nuevo intento, coordinacion o retiro por sucursal.',
    },
    paquete_fallido: {
        label: 'Paquete Fallido',
        summary: 'Hubo un problema con el envio y el equipo tiene que revisarlo.',
        next: 'Cuando se resuelva, el envio puede retomar el recorrido.',
    },
    retrasado: {
        label: 'Retrasado',
        summary: 'Tu envio viene con demora.',
        next: 'La fecha de entrega puede cambiar mientras se acomoda el recorrido.',
    },
    entregado: {
        label: 'Entregado',
        summary: 'Tu envio ya fue entregado.',
        next: 'Si no reconoces la entrega, contactate con soporte.',
    },
    cancelado: {
        label: 'Cancelado',
        summary: 'El envio fue cancelado y ya no sigue en curso.',
        next: 'Si queres mas contexto, soporte puede revisar el motivo.',
    },
    cancelada: {
        label: 'Cancelada',
        summary: 'El envio fue cancelado y ya no sigue en curso.',
        next: 'Si queres mas contexto, soporte puede revisar el motivo.',
    },
    default: {
        label: 'Estado actual',
        summary: 'Cuando tengas el tracking o el DNI, te ayudo a entender el estado del envio.',
        next: '',
    },
};

const STATUS_ALIASES = {
    pendiente: ['pendiente', 'confirmado', 'inicial'],
    asignado: ['asignado'],
    en_preparacion: ['en preparacion', 'preparacion'],
    en_transito: ['en transito', 'transito'],
    en_sucursal: ['en sucursal', 'sucursal'],
    intento_fallido: ['intento fallido'],
    paquete_fallido: ['paquete fallido'],
    retrasado: ['retrasado', 'demorado', 'demora'],
    entregado: ['entregado', 'entregada'],
    cancelado: ['cancelado', 'cancelada'],
};

const ORDERED_STATUS_KEYS = [
    'pendiente',
    'asignado',
    'en_preparacion',
    'en_transito',
    'en_sucursal',
    'intento_fallido',
    'paquete_fallido',
    'retrasado',
    'entregado',
    'cancelado',
];

const MAIN_MENU_ACTIONS = [
    { label: 'Buscar mi envio', action: 'request-lookup' },
    { label: 'Entender mi envio', action: 'show-understand-menu' },
    { label: 'Donde esta y cuando llega', action: 'show-location-menu' },
    { label: 'Hubo un problema', action: 'show-problem-menu' },
    { label: 'Retiro, entrega o comprobante', action: 'show-delivery-menu' },
    { label: 'Cambios y soporte', action: 'show-management-menu' },
    { label: 'Hablar con soporte', action: 'show-support' },
];

const DEFAULT_SUPPORT = {
    email: 'soporte@logitrack.com',
    hours: 'Lunes a viernes, 9 a 18 hs',
};

module.exports = {
    DEFAULT_SUPPORT,
    MAIN_MENU_ACTIONS,
    ORDERED_STATUS_KEYS,
    STATUS_ALIASES,
    STATUS_COPY,
};
