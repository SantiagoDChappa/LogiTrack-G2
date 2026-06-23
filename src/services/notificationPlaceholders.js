// Fuente única de placeholders de notificación.
// Usada por el render real (shipment.notifyShipmentEvent) y por la UI del editor.
// Agregar un placeholder de datos = una entrada en CATALOG.

const baseUrl = () => (process.env.APP_URL || process.env.BASE_URL || 'https://logitrack-prototype.onrender.com').replace(/\/+$/, '');

const notNil = (x) => x !== null && x !== undefined;

const fmtDate = (d) => {
    if (!d) { return ''; }
    try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return ''; }
};

const deliveryWindow = (s) => {
    if (s?.expectedDeliveryFrom && s?.expectedDeliveryTo) {
        return `${String(s.expectedDeliveryFrom).slice(0, 5)} a ${String(s.expectedDeliveryTo).slice(0, 5)}`;
    }
    return '';
};

// group: para agrupar en la UI. resolve(shipment): valor (string) en el envío real.
const CATALOG = [
    // Destinatario
    { token: 'fullName',       label: 'Nombre destinatario', group: 'Destinatario', description: 'Nombre completo del destinatario.',           resolve: s => s.recipient?.fullName || '' },
    { token: 'recipientEmail', label: 'Email destinatario',  group: 'Destinatario', description: 'Email del destinatario.',                      resolve: s => s.recipient?.email || '' },
    { token: 'recipientPhone', label: 'Teléfono destinatario', group: 'Destinatario', description: 'Teléfono del destinatario.',                 resolve: s => s.recipient?.phone || '' },
    { token: 'recipientDoc',   label: 'DNI destinatario',    group: 'Destinatario', description: 'Documento del destinatario.',                  resolve: s => (notNil(s.recipient?.document) ? String(s.recipient.document) : '') },
    // Remitente
    { token: 'senderName',     label: 'Nombre remitente',    group: 'Remitente',    description: 'Nombre completo del remitente.',               resolve: s => s.sender?.fullName || '' },
    // Envío
    { token: 'trackingCode',   label: 'Código seguimiento',  group: 'Envío',        description: 'Código de seguimiento del envío.',             resolve: s => s.trackingId || '' },
    { token: 'statusLabel',    label: 'Estado',              group: 'Envío',        description: 'Estado actual del envío.',                     resolve: s => s.status?.description || '' },
    { token: 'shipmentType',   label: 'Tipo de envío',       group: 'Envío',        description: 'Tipo de envío (Express/Standard).',            resolve: s => s.shipmentType?.description || '' },
    { token: 'expectedDeliveryDate', label: 'Fecha estimada', group: 'Envío',       description: 'Fecha estimada de entrega.',                   resolve: s => fmtDate(s.expectedDeliveryDate) },
    { token: 'deliveryWindow', label: 'Franja horaria',      group: 'Envío',        description: 'Franja horaria de entrega.',                   resolve: s => deliveryWindow(s) },
    { token: 'codAmount',      label: 'Monto contrareembolso', group: 'Envío',      description: 'Monto a cobrar (COD), si aplica.',             resolve: s => (notNil(s.codAmount) ? String(s.codAmount) : '') },
    { token: 'secretCode',     label: 'Código clave',        group: 'Envío',        description: 'Código clave de entrega.',                     resolve: s => s.deliverySecretCode || '' },
    { token: 'secretCodeLine', label: 'Línea código clave',  group: 'Envío',        description: 'Frase completa con el código clave (si existe).', resolve: s => (s.deliverySecretCode ? `\n\nCódigo clave de entrega: ${s.deliverySecretCode}. Mostráselo al repartidor para confirmar la entrega.` : '') },
    { token: 'failedReason',   label: 'Motivo intento fallido', group: 'Envío',     description: 'Motivo del último intento de entrega fallido.',       resolve: s => s._failedReason || '' },
    { token: 'daysDelayed',    label: 'Días de demora',         group: 'Envío',     description: 'Cantidad de días de demora respecto a la fecha estimada.', resolve: s => s._daysDelayed || '' },
    // Dirección
    { token: 'addressLine',    label: 'Dirección',           group: 'Dirección',    description: 'Calle y número de entrega.',                   resolve: s => s.address ? `${s.address.street || ''} ${s.address.number || ''}`.trim() : '' },
    { token: 'province',       label: 'Provincia',           group: 'Dirección',    description: 'Provincia de destino.',                        resolve: s => s.address?.province?.description || '' },
    { token: 'postalCode',     label: 'Código postal',       group: 'Dirección',    description: 'Código postal de destino.',                    resolve: s => (notNil(s.address?.postalCode) ? String(s.address.postalCode) : '') },
    // Sucursal
    { token: 'branchName',     label: 'Sucursal actual',     group: 'Sucursal',     description: 'Sucursal donde está el envío.',                resolve: s => s.currentBranch?.name || '' },
    // URLs accionables
    { token: 'trackingUrl',    label: 'Enlace seguimiento',  group: 'Enlaces',      description: '🔗 Ver el seguimiento del envío en el portal.', resolve: s => (s.trackingId ? `${baseUrl()}/?q=${encodeURIComponent(s.trackingId)}` : baseUrl()) },
    { token: 'selfServiceUrl', label: 'Enlace autogestión',  group: 'Enlaces',      description: '🔗 Reprogramar o elegir retiro en sucursal (sin login).', resolve: s => (s.portalToken ? `${baseUrl()}/portal/self/${s.portalToken}` : (s.trackingId ? `${baseUrl()}/?q=${encodeURIComponent(s.trackingId)}` : baseUrl())) },
    { token: 'incidentUrl',    label: 'Enlace incidencia',   group: 'Enlaces',      description: '🔗 Ver la incidencia creada (o reportar una nueva si no existe).', resolve: s => (notNil(s._incidentId)
        ? `${baseUrl()}/portal/mis-envios/incidencia/${s._incidentId}`
        : (s.trackingId ? `${baseUrl()}/portal/incident/new?trackingId=${encodeURIComponent(s.trackingId)}` : `${baseUrl()}/portal/incident/new`)) },
    // Acceso al portal — solo aplican al evento PORTAL_CLIENT_ACCESS (se resuelven al pedir el código).
    { token: 'codigo',         label: 'Código de verificación', group: 'Acceso al portal', description: 'Código de 6 dígitos para acceder a "Mis envíos".', resolve: s => s._codigo || '' },
    { token: 'ttlHoras',       label: 'Validez (horas)',        group: 'Acceso al portal', description: 'Cantidad de horas que el código sigue siendo válido.', resolve: s => (notNil(s._ttlHoras) ? String(s._ttlHoras) : '') },
    // Incidencia — aplican al evento INCIDENT_STATUS_CHANGE (se resuelven al cambiar el estado).
    { token: 'incidentId',     label: 'N° de incidencia',       group: 'Incidencia', description: 'Identificador de la incidencia.',         resolve: s => (notNil(s._incidentId) ? String(s._incidentId) : '') },
    { token: 'incidentEstado', label: 'Estado de incidencia',   group: 'Incidencia', description: 'Nuevo estado de la incidencia.',           resolve: s => s._incidentEstado || '' },
    { token: 'incidentComentario', label: 'Comentario de la incidencia', group: 'Incidencia', description: 'Comentario que dejó el operador al cambiar el estado o cerrar la incidencia.', resolve: s => s._incidentComentario || '' },
    // Control de fatiga — aplican al evento FATIGUE_DRIVER_DISABLED_CONSENT (se resuelven al inhabilitar al transportista).
    { token: 'transportistaNombre',  label: 'Nombre transportista', group: 'Control de fatiga', description: 'Nombre completo del transportista inhabilitado.',         resolve: s => s._transportistaNombre || '' },
    { token: 'transportistaId',      label: 'ID transportista',     group: 'Control de fatiga', description: 'Identificador del transportista inhabilitado.',            resolve: s => (notNil(s._transportistaId) ? String(s._transportistaId) : '') },
    { token: 'sucursalNombre',       label: 'Sucursal transportista', group: 'Control de fatiga', description: 'Sucursal asignada al transportista.',                    resolve: s => s._sucursalNombre || '' },
    { token: 'sucursalId',           label: 'ID sucursal',          group: 'Control de fatiga', description: 'Identificador de la sucursal asignada al transportista.', resolve: s => (notNil(s._sucursalId) ? String(s._sucursalId) : '') },
    { token: 'rutaId',               label: 'Ruta',                 group: 'Control de fatiga', description: 'Ruta en la que el transportista rechazó el consentimiento.', resolve: s => (notNil(s._rutaId) ? String(s._rutaId) : '') },
    { token: 'rechazos',             label: 'Rechazos acumulados',  group: 'Control de fatiga', description: 'Cantidad de rechazos de consentimiento desde el último restablecimiento.', resolve: s => (notNil(s._rechazos) ? String(s._rechazos) : '') },
    { token: 'maxRechazos',          label: 'Límite de rechazos',   group: 'Control de fatiga', description: 'Límite parametrizado de rechazos antes de inhabilitar.',  resolve: s => (notNil(s._maxRechazos) ? String(s._maxRechazos) : '') },
    { token: 'motivoInhabilitacion', label: 'Motivo',               group: 'Control de fatiga', description: 'Motivo registrado de la inhabilitación.',                  resolve: s => s._motivoInhabilitacion || '' },
    { token: 'score',                label: 'Score de fatiga',      group: 'Control de fatiga', description: 'Puntaje obtenido en el control (mayor = peor).',           resolve: s => (notNil(s._score) ? String(s._score) : '') },
    { token: 'minutos',              label: 'Minutos',              group: 'Control de fatiga', description: 'Minutos sin completar el re-chequeo pedido en ruta.',      resolve: s => (notNil(s._minutos) ? String(s._minutos) : '') },
    { token: 'ventanaCantidad',      label: 'Cantidad de bloqueos', group: 'Control de fatiga', description: 'Bloqueos por fatiga en la ventana de patrón recurrente.',  resolve: s => (notNil(s._ventanaCantidad) ? String(s._ventanaCantidad) : '') },
    { token: 'ventanaDias',          label: 'Ventana (días)',       group: 'Control de fatiga', description: 'Cantidad de días de la ventana de patrón recurrente.',     resolve: s => (notNil(s._ventanaDias) ? String(s._ventanaDias) : '') },
    { token: 'panelUrl',             label: 'Enlace al panel',      group: 'Control de fatiga', description: '🔗 Link al panel de Ojo de Patrón (/fatigue).',            resolve: s => s._panelUrl || `${baseUrl()}/fatigue` },
    // Pago de factura — aplican al evento INVOICE_PAYMENT_LINK (se resuelven al emitir la factura).
    { token: 'invoiceNumber',        label: 'N° de factura',        group: 'Pago de factura', description: 'Número de la factura a pagar.',                            resolve: s => s._invoiceNumber || '' },
    { token: 'totalAmount',          label: 'Total a pagar',        group: 'Pago de factura', description: 'Importe total con IVA, ya formateado (ej. $ 12.100,00).',   resolve: s => s._totalAmount || '' },
    { token: 'empresaNombre',        label: 'Nombre de la empresa', group: 'Pago de factura', description: 'Nombre de la empresa (LogiTrack o el configurado).',       resolve: s => s._empresaNombre || 'LogiTrack' },
    { token: 'payUrl',               label: 'Enlace de pago',       group: 'Pago de factura', description: '🔗 Link al checkout de pago simulado (estilo Mercado Pago).', resolve: s => s._payUrl || `${baseUrl()}/pago/demo` },
];

// Construye { token: valor } a partir de un shipment (instancia o JSON).
const buildVars = (shipment) => {
    const s = (shipment && typeof shipment.toJSON === 'function') ? shipment.toJSON() : (shipment || {});
    const vars = {};
    for (const p of CATALOG) {
        try { vars[p.token] = p.resolve(s); } catch { vars[p.token] = ''; }
    }
    return vars;
};

// CP-CNNF04: detección de variables {{token}} no válidas en una plantilla.
const TOKEN_RE = /\{\{\s*([\w]+)\s*\}\}/g;
const knownTokens = () => new Set(CATALOG.map((p) => p.token));
const extractTokens = (str) => {
    const out = new Set();
    String(str || '').replace(TOKEN_RE, (_, k) => { out.add(k); return _; });
    return [...out];
};
// Tokens usados en `str` que NO están permitidos. `allowedExtra`: tokens válidos extra (ej. variables custom).
const findUnknownTokens = (str, allowedExtra = []) => {
    const allowed = knownTokens();
    for (const t of allowedExtra) { allowed.add(t); }
    return extractTokens(str).filter((t) => !allowed.has(t));
};

// Reemplazo genérico {{key}} (mismo criterio que standardMessage.render).
const render = (str, vars = {}) => String(str || '')
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));

// Metadata para la UI (sin resolvers).
const catalogMeta = () => CATALOG.map(({ token, label, description, group }) => ({ token, label, description, group }));

// Shipment de ejemplo para previsualización / email de prueba.
const sampleShipment = () => ({
    trackingId: 'ENV-001234',
    _codigo: '482913',
    _ttlHoras: 24,
    expectedDeliveryDate: new Date(),
    expectedDeliveryFrom: '09:00', expectedDeliveryTo: '13:00',
    codAmount: 15000,
    deliverySecretCode: '4827',
    portalToken: 'demo-token-1234',
    _failedReason: 'Destinatario ausente',
    _daysDelayed: '3',
    _incidentId: '1024',
    _incidentEstado: 'En revisión',
    _invoiceNumber: 'A-0001-00001234',
    _totalAmount: '$ 12.100,00',
    _empresaNombre: 'LogiTrack',
    _payUrl: baseUrl() + '/pago/demo-token',
    recipient: { fullName: 'Juan Pérez', email: 'juan@ejemplo.com', phone: '11-5555-0000', document: 30111222 },
    sender:    { fullName: 'Tienda Online SA' },
    status:    { description: 'En Sucursal' },
    shipmentType: { description: 'Express' },
    address:   { street: 'Av. Siempreviva', number: '742', postalCode: 1425, province: { description: 'Buenos Aires' } },
    currentBranch: { name: 'Sucursal Centro' },
});

module.exports = { CATALOG, buildVars, render, catalogMeta, sampleShipment, findUnknownTokens, extractTokens, baseUrl };
