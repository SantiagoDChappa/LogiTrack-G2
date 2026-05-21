const STATUS_COPY = {
    pendiente: {
        label: 'Pendiente',
        summary: 'El envio fue registrado en el sistema y todavia no entro en movimiento operativo.',
        next: 'Lo habitual es que luego pase a asignado, preparacion o transito.',
    },
    inicial: {
        label: 'Inicial',
        summary: 'El envio recien fue cargado o esta en una etapa muy temprana del circuito.',
        next: 'Todavia puede faltar asignacion o preparacion antes de salir.',
    },
    asignado: {
        label: 'Asignado',
        summary: 'El envio ya fue tomado por la operacion y tiene un recurso asignado para seguir el circuito.',
        next: 'El siguiente paso normal es la preparacion o la salida a transito.',
    },
    en_preparacion: {
        label: 'En Preparacion',
        summary: 'El envio se esta acondicionando o consolidando antes de continuar el recorrido.',
        next: 'Despues suele pasar a transito o a una sucursal de despacho.',
    },
    en_transito: {
        label: 'En Transito',
        summary: 'El paquete esta circulando entre nodos logisticos o hacia el destino final.',
        next: 'Segun el circuito, puede pasar por sucursal o quedar entregado.',
    },
    en_sucursal: {
        label: 'En Sucursal',
        summary: 'El envio fue escaneado en una sucursal o centro logistico intermedio.',
        next: 'Puede quedar listo para derivacion, reparto o retiro, segun la operacion.',
    },
    intento_fallido: {
        label: 'Intento Fallido',
        summary: 'Hubo un intento de entrega que no se pudo completar.',
        next: 'Suele resolverse con reintento, coordinacion o retiro por sucursal.',
    },
    paquete_fallido: {
        label: 'Paquete Fallido',
        summary: 'Se detecto una incidencia operativa y el envio necesita revision antes de continuar.',
        next: 'Normalmente requiere gestion interna antes de reanudar el circuito.',
    },
    retrasado: {
        label: 'Retrasado',
        summary: 'La entrega presenta una demora respecto del circuito esperado.',
        next: 'La fecha final puede ajustarse segun la operacion y el motivo de la demora.',
    },
    entregado: {
        label: 'Entregado',
        summary: 'El envio fue marcado como entregado al destinatario o receptor autorizado.',
        next: 'Desde este estado ya no deberia haber nuevos movimientos logisticos.',
    },
    cancelado: {
        label: 'Cancelado',
        summary: 'El envio fue dado de baja y no seguira avanzando en el circuito.',
        next: 'Si queres mas contexto, soporte puede revisar el motivo de la cancelacion.',
    },
    cancelada: {
        label: 'Cancelada',
        summary: 'El envio fue dado de baja y no seguira avanzando en el circuito.',
        next: 'Si queres mas contexto, soporte puede revisar el motivo de la cancelacion.',
    },
    default: {
        label: 'Estado actual',
        summary: 'Te puedo ayudar a interpretar el estado una vez que identifiquemos el envio.',
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
    { label: 'Buscar un envio', action: 'request-lookup' },
    { label: 'Estado actual', action: 'show-status' },
    { label: 'Significado de los estados', action: 'show-status-guide' },
    { label: 'Ubicacion y recorrido', action: 'show-location' },
    { label: 'Fecha estimada', action: 'show-eta' },
    { label: 'Historial de movimientos', action: 'show-history' },
    { label: 'Incidencias', action: 'show-issues' },
    { label: 'Sucursal o retiro', action: 'show-branch' },
    { label: 'Comprobante de entrega', action: 'show-pod' },
    { label: 'Cambios o gestiones', action: 'show-management' },
    { label: 'Notificaciones', action: 'show-notifications' },
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
