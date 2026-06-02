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
    // Dirección
    { token: 'addressLine',    label: 'Dirección',           group: 'Dirección',    description: 'Calle y número de entrega.',                   resolve: s => s.address ? `${s.address.street || ''} ${s.address.number || ''}`.trim() : '' },
    { token: 'province',       label: 'Provincia',           group: 'Dirección',    description: 'Provincia de destino.',                        resolve: s => s.address?.province?.description || '' },
    { token: 'postalCode',     label: 'Código postal',       group: 'Dirección',    description: 'Código postal de destino.',                    resolve: s => (notNil(s.address?.postalCode) ? String(s.address.postalCode) : '') },
    // Sucursal
    { token: 'branchName',     label: 'Sucursal actual',     group: 'Sucursal',     description: 'Sucursal donde está el envío.',                resolve: s => s.currentBranch?.name || '' },
    // URLs accionables
    { token: 'trackingUrl',    label: 'Enlace seguimiento',  group: 'Enlaces',      description: '🔗 Ver el seguimiento del envío en el portal.', resolve: s => (s.trackingId ? `${baseUrl()}/portal?q=${encodeURIComponent(s.trackingId)}` : baseUrl()) },
    { token: 'selfServiceUrl', label: 'Enlace autogestión',  group: 'Enlaces',      description: '🔗 Reprogramar o elegir retiro en sucursal (sin login).', resolve: s => (s.portalToken ? `${baseUrl()}/portal/self/${s.portalToken}` : (s.trackingId ? `${baseUrl()}/portal?q=${encodeURIComponent(s.trackingId)}` : baseUrl())) },
    { token: 'incidentUrl',    label: 'Enlace incidencia',   group: 'Enlaces',      description: '🔗 Reportar o responder una incidencia del envío.', resolve: s => (s.trackingId ? `${baseUrl()}/portal/incident/new?trackingId=${encodeURIComponent(s.trackingId)}` : `${baseUrl()}/portal/incident/new`) },
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

// Reemplazo genérico {{key}} (mismo criterio que standardMessage.render).
const render = (str, vars = {}) => String(str || '')
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));

// Metadata para la UI (sin resolvers).
const catalogMeta = () => CATALOG.map(({ token, label, description, group }) => ({ token, label, description, group }));

// Shipment de ejemplo para previsualización / email de prueba.
const sampleShipment = () => ({
    trackingId: 'ENV-001234',
    expectedDeliveryDate: new Date(),
    expectedDeliveryFrom: '09:00', expectedDeliveryTo: '13:00',
    codAmount: 15000,
    deliverySecretCode: '4827',
    portalToken: 'demo-token-1234',
    recipient: { fullName: 'Juan Pérez', email: 'juan@ejemplo.com', phone: '11-5555-0000', document: 30111222 },
    sender:    { fullName: 'Tienda Online SA' },
    status:    { description: 'En Sucursal' },
    shipmentType: { description: 'Express' },
    address:   { street: 'Av. Siempreviva', number: '742', postalCode: 1425, province: { description: 'Buenos Aires' } },
    currentBranch: { name: 'Sucursal Centro' },
});

module.exports = { CATALOG, buildVars, render, catalogMeta, sampleShipment };
